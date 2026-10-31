import { closeSync, openSync, writeSync } from "node:fs";
import { readBundle, readObject, readSerializedFile } from "./unity-bundle.mjs";

const WindowsTarget = 19;
const WebGLTarget = 20;
const Texture2D = 28;
const SerializedFileNode = 4;
const zeroes = Buffer.alloc(16);

const [input, output] = process.argv.slice(2);
const bundle = readBundle(input);
const main = bundle.nodes.find((node) => node.flags & SerializedFileNode);
const streams = bundle.nodes.find((node) => node.name.endsWith(".resS"));
const resource = bundle.nodes.find((node) => node.name.endsWith(".resource"));
const file = readSerializedFile(main.data);
if (file.target !== WindowsTarget && file.target !== WebGLTarget) throw new Error(`Unexpected build target ${file.target}`);
if (file.bigEndian) throw new Error("Big-endian serialized files are not supported");

const textureType = file.types.find((type) => type.classId === Texture2D);

function inlineTexture(object) {
  const start = file.dataOffset + object.offset;
  const { value, end } = readObject(textureType.tree, main.data, start, true);
  if (end !== start + object.size) throw new Error(`Texture object ${object.pathId} is ${end - start} bytes, table says ${object.size}`);

  const stream = value.m_StreamData;
  if (stream.size === 0) return null;
  if (value["image data"].length !== 0) throw new Error(`Texture object ${object.pathId} has both inline and streamed data`);
  if (!stream.path.endsWith(streams.name)) throw new Error(`Texture object ${object.pathId} streams from ${stream.path}`);

  const imageStart = value["image data"].start;
  const prefix = main.data.subarray(start, imageStart);
  const image = streams.data.subarray(stream.offset, stream.offset + stream.size);
  if (image.length !== stream.size) throw new Error(`Texture object ${object.pathId} streams past the end of ${streams.name}`);

  const length = Buffer.alloc(4);
  length.writeInt32LE(image.length);
  const padding = (4 - (image.length % 4)) % 4;
  return { prefix, length, image, padding, size: prefix.length + 4 + image.length + padding + 16 };
}

const metadataEnd = 48 + file.metadataSize;
const head = Buffer.from(main.data.subarray(0, file.dataOffset));
head.writeInt32LE(WebGLTarget, file.targetPosition);

const ordered = [...file.objects].sort((a, b) => a.offset - b.offset);
const pieces = new Map();
let position = 0;
let inlined = 0;
let inlinedBytes = 0;
for (const object of ordered) {
  position += (8 - (position % 8)) % 8;
  const piece = object.classId === Texture2D ? inlineTexture(object) : null;
  const size = piece ? piece.size : object.size;
  if (piece) {
    pieces.set(object, piece);
    inlined++;
    inlinedBytes += piece.image.length;
  }
  head.writeBigInt64LE(BigInt(position), object.offsetPosition);
  head.writeUInt32LE(size, object.offsetPosition + 8);
  object.newOffset = position;
  object.newSize = size;
  position += size;
}
if (metadataEnd > file.dataOffset) throw new Error("Metadata overlaps object data");
const serializedSize = file.dataOffset + position;
head.writeBigInt64BE(BigInt(serializedSize), 24);

const nodes = [{ name: main.name, flags: SerializedFileNode, size: serializedSize }];
if (resource) nodes.push({ name: resource.name, flags: 0, size: resource.data.length });
const totalData = nodes.reduce((sum, node) => sum + node.size, 0);

const nodeTable = [];
let nodeOffset = 0;
for (const node of nodes) {
  const record = Buffer.alloc(20);
  record.writeBigInt64BE(BigInt(nodeOffset), 0);
  record.writeBigInt64BE(BigInt(node.size), 8);
  record.writeUInt32BE(node.flags, 16);
  nodeTable.push(record, Buffer.from(`${node.name}\0`));
  nodeOffset += node.size;
}
const nodeCount = Buffer.alloc(4);
nodeCount.writeInt32BE(nodes.length);
const blocks = Buffer.alloc(4 + 10);
blocks.writeInt32BE(1, 0);
blocks.writeUInt32BE(totalData, 4);
blocks.writeUInt32BE(totalData, 8);
const info = Buffer.concat([Buffer.alloc(16), blocks, nodeCount, ...nodeTable]);

const strings = Buffer.from(`UnityFS\0`);
const versions = Buffer.from(`${bundle.header.playerVersion}\0${bundle.header.engineVersion}\0`);
const fields = Buffer.alloc(4 + versions.length + 8 + 12);
fields.writeUInt32BE(bundle.header.version, 0);
versions.copy(fields, 4);
const fieldsAt = 4 + versions.length;
let headerSize = strings.length + fields.length;
const headerPadding = (16 - (headerSize % 16)) % 16;
headerSize += headerPadding;
const afterInfo = headerSize + info.length;
const dataPadding = (16 - (afterInfo % 16)) % 16;
fields.writeBigInt64BE(BigInt(afterInfo + dataPadding + totalData), fieldsAt);
fields.writeUInt32BE(info.length, fieldsAt + 8);
fields.writeUInt32BE(info.length, fieldsAt + 12);
fields.writeUInt32BE(0x40 | 0x200, fieldsAt + 16);

const out = openSync(output, "w");
const write = (buffer) => {
  let done = 0;
  while (done < buffer.length) done += writeSync(out, buffer, done, Math.min(buffer.length - done, 0x40000000));
};
write(strings);
write(fields);
write(zeroes.subarray(0, headerPadding));
write(info);
write(zeroes.subarray(0, dataPadding));

write(head);
let written = 0;
const emptyStream = Buffer.alloc(16);
for (const object of ordered) {
  if (object.newOffset > written) write(zeroes.subarray(0, object.newOffset - written));
  const piece = pieces.get(object);
  if (piece) {
    write(piece.prefix);
    write(piece.length);
    write(piece.image);
    write(zeroes.subarray(0, piece.padding));
    write(emptyStream);
  } else {
    const start = file.dataOffset + object.offset;
    write(main.data.subarray(start, start + object.size));
  }
  written = object.newOffset + object.newSize;
}
if (resource) write(resource.data);
closeSync(out);

const result = readBundle(output);
const resultMain = result.nodes.find((node) => node.flags & SerializedFileNode);
const resultFile = readSerializedFile(resultMain.data);
if (result.nodes.some((node) => node.name.endsWith(".resS"))) throw new Error("Output still has a .resS node");
if (resultFile.target !== WebGLTarget) throw new Error(`Output has build target ${resultFile.target}`);
if (resultFile.objects.length !== file.objects.length) throw new Error("Output has a different object count");

const sourceByPath = new Map(file.objects.map((object) => [object.pathId, object]));
for (const object of resultFile.objects) {
  const source = sourceByPath.get(object.pathId);
  if (!source || source.typeIndex !== object.typeIndex) throw new Error(`Object ${object.pathId} changed type`);
  const start = resultFile.dataOffset + object.offset;
  if (pieces.has(source)) {
    const { value, end } = readObject(textureType.tree, resultMain.data, start, true);
    if (end !== start + object.size) throw new Error(`Output texture ${object.pathId} is ${end - start} bytes, table says ${object.size}`);
    if (value.m_StreamData.size !== 0 || value["image data"].length !== pieces.get(source).image.length) throw new Error(`Output texture ${object.pathId} was not inlined`);
    const image = resultMain.data.subarray(value["image data"].start + 4, value["image data"].start + 4 + value["image data"].length);
    if (image.compare(pieces.get(source).image) !== 0) throw new Error(`Output texture ${object.pathId} has different image data`);
  } else {
    const sourceStart = file.dataOffset + source.offset;
    const original = main.data.subarray(sourceStart, sourceStart + source.size);
    if (resultMain.data.subarray(start, start + object.size).compare(original) !== 0) throw new Error(`Object ${object.pathId} changed`);
  }
}

console.log(`${input}: ${inlined} textures inlined, ${inlinedBytes} bytes, ${file.objects.length} objects, ${totalData} bytes of data`);
