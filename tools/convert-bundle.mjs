import { closeSync, openSync, readFileSync, writeSync } from "node:fs";
import { readBundle, readObject, readSerializedFile } from "./unity-bundle.mjs";

const WebGLTarget = 20;
const DesktopTargets = new Set([5, 19, WebGLTarget]);
const Texture2D = 28;
const SerializedFileNode = 4;
const zeroes = Buffer.alloc(16);

const AudioClip = 83;
const DecompressOnLoad = 0;

const args = process.argv.slice(2);
const decodable = args[0] === "--decodable";
const [input, output, audioBundlePath, audioManifestPath] = decodable ? args.slice(1) : args;
const bundle = readBundle(input);
const serializedNodes = bundle.nodes.filter((node) => node.flags & SerializedFileNode);
const streams = bundle.nodes.find((node) => node.name.endsWith(".resS"));
if (serializedNodes.length === 0) throw new Error(`${input} has no serialized files`);

function writeBundle(path, nodes) {
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

  const signature = Buffer.from("UnityFS\0");
  const versions = Buffer.from(`${bundle.header.playerVersion}\0${bundle.header.engineVersion}\0`);
  const fields = Buffer.alloc(4 + versions.length + 8 + 12);
  fields.writeUInt32BE(Math.max(bundle.header.version, 7), 0);
  versions.copy(fields, 4);
  const fieldsAt = 4 + versions.length;
  let headerSize = signature.length + fields.length;
  const headerPadding = (16 - (headerSize % 16)) % 16;
  headerSize += headerPadding;
  const afterInfo = headerSize + info.length;
  const dataPadding = (16 - (afterInfo % 16)) % 16;
  fields.writeBigInt64BE(BigInt(afterInfo + dataPadding + totalData), fieldsAt);
  fields.writeUInt32BE(info.length, fieldsAt + 8);
  fields.writeUInt32BE(info.length, fieldsAt + 12);
  fields.writeUInt32BE(0x40 | 0x200, fieldsAt + 16);

  const out = openSync(path, "w");
  const write = (buffer) => {
    let done = 0;
    while (done < buffer.length) done += writeSync(out, buffer, done, Math.min(buffer.length - done, 0x40000000));
  };
  write(signature);
  write(fields);
  write(zeroes.subarray(0, headerPadding));
  write(info);
  write(zeroes.subarray(0, dataPadding));
  for (const node of nodes) {
    for (const chunk of node.chunks) write(chunk);
  }
  closeSync(out);
}

function retargetLegacyFile(node) {
  const end = node.data.indexOf(0, 20);
  const position = end + 1;
  const target = node.data.readInt32LE(position);
  if (!DesktopTargets.has(target)) throw new Error(`${node.name} has unexpected build target ${target}`);
  node.data.writeInt32LE(WebGLTarget, position);
}

function isLegacy(node) {
  return node.data.readUInt32BE(8) < 22;
}

if (!decodable && serializedNodes.every(isLegacy)) {
  if (streams) throw new Error(`${input} streams textures from a serialized file version the converter can't inline`);
  serializedNodes.forEach(retargetLegacyFile);
  writeBundle(output, bundle.nodes.map((node) => ({ name: node.name, flags: node.flags, size: node.data.length, chunks: [node.data] })));

  const check = readBundle(output);
  for (const node of check.nodes.filter((candidate) => candidate.flags & SerializedFileNode)) {
    const target = node.data.readInt32LE(node.data.indexOf(0, 20) + 1);
    if (target !== WebGLTarget) throw new Error(`Output ${node.name} has build target ${target}`);
  }
  console.log(`${input}: ${serializedNodes.length} legacy serialized files retargeted`);
  process.exit(0);
}

if (serializedNodes.length !== 1) throw new Error(`${input} has ${serializedNodes.length} serialized files`);
const main = serializedNodes[0];
const resource = bundle.nodes.find((node) => node.name.endsWith(".resource"));
const file = readSerializedFile(main.data);
if (!DesktopTargets.has(file.target)) throw new Error(`Unexpected build target ${file.target}`);
if (file.bigEndian) throw new Error("Big-endian serialized files are not supported");

const textureType = file.types.find((type) => type.classId === Texture2D);
const audioType = file.types.find((type) => type.classId === AudioClip);

function readClips(serialized, data, type) {
  return serialized.objects.filter((object) => object.classId === AudioClip).map((object) => {
    const { value } = readObject(type.tree, data, serialized.dataOffset + object.offset, true);
    return value;
  });
}

if (decodable) {
  const clips = readClips(file, main.data, audioType);
  for (const clip of clips) {
    main.data.writeInt32LE(DecompressOnLoad, clip.__at.m_LoadType);
    main.data[clip.__at.m_PreloadAudioData] = 1;
    main.data[clip.__at.m_LoadInBackground] = 0;
  }
  writeBundle(output, bundle.nodes.map((node) => ({ name: node.name, flags: node.flags, size: node.data.length, chunks: [node.data] })));
  console.log(`${input}: ${clips.length} audio clips made decodable`);
  process.exit(0);
}

let replacementResource = null;
let replacedClips = 0;

function spliceAudio() {
  const encodedBundle = readBundle(audioBundlePath);
  const encodedMain = encodedBundle.nodes.find((node) => node.flags & SerializedFileNode);
  replacementResource = encodedBundle.nodes.find((node) => node.name.endsWith(".resource")).data;
  const encodedFile = readSerializedFile(encodedMain.data);
  const encodedType = encodedFile.types.find((type) => type.classId === AudioClip);
  const encoded = new Map(readClips(encodedFile, encodedMain.data, encodedType).map((clip) => [clip.m_Name, clip]));

  const candidates = new Map();
  for (const line of readFileSync(audioManifestPath, "utf8").split("\n").filter(Boolean)) {
    const [id, name, channels, frequency, length] = line.split("\t");
    const key = `${name}|${channels}|${frequency}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push({ id, length: Number(length) });
  }

  for (const clip of readClips(file, main.data, audioType)) {
    const options = candidates.get(`${clip.m_Name}|${clip.m_Channels}|${clip.m_Frequency}`) ?? [];
    const match = options.find((option) => Math.abs(option.length - clip.m_Length) < 0.002);
    if (!match) throw new Error(`No encoded audio for clip ${clip.m_Name} (${clip.m_Channels} channels, ${clip.m_Frequency} Hz, ${clip.m_Length} s)`);
    const replacement = encoded.get(match.id);
    if (!replacement) throw new Error(`Encoded audio bundle has no clip ${match.id}`);

    main.data.writeInt32LE(replacement.m_LoadType, clip.__at.m_LoadType);
    main.data.writeInt32LE(replacement.m_Channels, clip.__at.m_Channels);
    main.data.writeInt32LE(replacement.m_Frequency, clip.__at.m_Frequency);
    main.data.writeInt32LE(replacement.m_BitsPerSample, clip.__at.m_BitsPerSample);
    main.data.writeFloatLE(replacement.m_Length, clip.__at.m_Length);
    main.data.writeBigInt64LE(BigInt(replacement.m_Resource.m_Offset), clip.m_Resource.__at.m_Offset);
    main.data.writeBigInt64LE(BigInt(replacement.m_Resource.m_Size), clip.m_Resource.__at.m_Size);
    main.data.writeInt32LE(replacement.m_CompressionFormat, clip.__at.m_CompressionFormat);
    replacedClips++;
  }
}

if (audioBundlePath) spliceAudio();

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

if (48 + file.metadataSize > file.dataOffset) throw new Error("Metadata overlaps object data");
const head = Buffer.from(main.data.subarray(0, file.dataOffset));
head.writeInt32LE(WebGLTarget, file.targetPosition);

const ordered = [...file.objects].sort((a, b) => a.offset - b.offset);
const pieces = new Map();
const emptyStream = Buffer.alloc(16);
const chunks = [head];
let position = 0;
let inlinedBytes = 0;
for (const object of ordered) {
  const padding = (8 - (position % 8)) % 8;
  if (padding) chunks.push(zeroes.subarray(0, padding));
  position += padding;

  const piece = object.classId === Texture2D ? inlineTexture(object) : null;
  const size = piece ? piece.size : object.size;
  if (piece) {
    pieces.set(object, piece);
    inlinedBytes += piece.image.length;
    chunks.push(piece.prefix, piece.length, piece.image, zeroes.subarray(0, piece.padding), emptyStream);
  } else {
    const start = file.dataOffset + object.offset;
    chunks.push(main.data.subarray(start, start + object.size));
  }
  head.writeBigInt64LE(BigInt(position), object.offsetPosition);
  head.writeUInt32LE(size, object.offsetPosition + 8);
  position += size;
}
const serializedSize = file.dataOffset + position;
head.writeBigInt64BE(BigInt(serializedSize), 24);

const nodes = [{ name: main.name, flags: SerializedFileNode, size: serializedSize, chunks }];
if (resource) {
  const data = replacementResource ?? resource.data;
  nodes.push({ name: resource.name, flags: 0, size: data.length, chunks: [data] });
}
writeBundle(output, nodes);

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

console.log(`${input}: ${pieces.size} textures inlined, ${inlinedBytes} bytes, ${replacedClips} audio clips replaced, ${file.objects.length} objects verified`);
