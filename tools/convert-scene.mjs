import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Cursor, decodeLz4, readObject, readSerializedFile } from "./unity-bundle.mjs";

const GameObject = 1;
const Transform = 4;
const Texture2D = 28;
const Mesh = 43;
const AudioClip = 83;
const AssetBundle = 142;
const WebGLTarget = 20;
const Excluded = new Set([AudioClip, 104, 150, 154, 156, 157, 196, 218, 1953259897]);
const Terrain = 218;

const [dataDir, coreBundle, sceneName, output] = process.argv.slice(2);

function readCoreMetadata(path) {
  const buffer = readFileSync(path);
  const cursor = new Cursor(buffer);
  cursor.cstring();
  cursor.skip(4);
  cursor.cstring();
  cursor.cstring();
  cursor.skip(8);
  const stored = cursor.u32();
  const size = cursor.u32();
  const flags = cursor.u32();
  cursor.align(16);
  const headerEnd = cursor.position;
  const atEnd = (flags & 0x80) !== 0;
  const start = atEnd ? buffer.length - stored : headerEnd;
  const info = new Cursor(decodeLz4(buffer.subarray(start, start + stored), size));
  cursor.position = atEnd ? headerEnd : headerEnd + stored;
  if (flags & 0x200) cursor.align(16);
  info.skip(16);
  const blocks = info.i32();
  const parts = [];
  let total = 0;
  let position = cursor.position;
  for (let i = 0; i < blocks && total < 16 * 1024 * 1024; i++) {
    const blockSize = info.u32();
    const blockStored = info.u32();
    const blockFlags = info.u16();
    const block = buffer.subarray(position, position + blockStored);
    position += blockStored;
    parts.push(blockFlags & 0x3f ? decodeLz4(block, blockSize) : block);
    total += blockSize;
  }
  return readSerializedFile(Buffer.concat(parts), true);
}

const core = readCoreMetadata(coreBundle);
const layouts = new Map(core.types.filter((type) => type.tree && type.classId !== 114).map((type) => [type.classId, type]));

const files = new Map();
function openFile(name) {
  if (!files.has(name)) {
    const data = readFileSync(join(dataDir, name));
    const file = readSerializedFile(data);
    file.name = name;
    file.data = data;
    file.byPath = new Map(file.objects.map((object) => [object.pathId, object]));
    files.set(name, file);
  }
  return files.get(name);
}

function pointers(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) pointers(item, found);
  } else if (value && typeof value === "object") {
    if ("m_FileID" in value && "m_PathID" in value) found.push(value.__start);
    else for (const key of Object.keys(value)) pointers(value[key], found);
  }
  return found;
}

function parse(file, object) {
  const layout = layouts.get(object.classId);
  if (!layout) throw new Error(`No layout for class ${object.classId} in ${file.name}`);
  const start = file.dataOffset + object.offset;
  const { value, end } = readObject(layout.tree, file.data, start, true);
  if (end !== start + object.size) throw new Error(`${file.name} object ${object.pathId} class ${object.classId} is ${end - start} bytes, table says ${object.size}`);
  return { value, start };
}

const isEngineFile = (path) => /unity default resources|unity_builtin_extra/.test(path);
const engineFiles = [];
const scene = openFile(sceneName);

function target(file, position) {
  const fileId = file.data.readInt32LE(position);
  const pathId = file.data.readBigInt64LE(position + 4);
  if (pathId === 0n) return null;
  if (fileId === 0) return { file, pathId };
  const external = file.externals[fileId - 1];
  if (isEngineFile(external.path)) return { external, pathId };
  return { file: openFile(external.path.split("/").pop()), pathId };
}

const dropped = new Set();
for (const object of scene.objects.filter((candidate) => candidate.classId === GameObject)) {
  const { value } = parse(scene, object);
  const components = pointers(value.m_Component).map((position) => target(scene, position));
  if (components.some((component) => component?.file?.byPath.get(component.pathId)?.classId === Terrain)) {
    dropped.add(object);
    for (const component of components) dropped.add(scene.byPath.get(component.pathId));
  }
}

const streams = new Map();
function readStream(name) {
  if (!streams.has(name)) streams.set(name, readFileSync(join(dataDir, name)));
  return streams.get(name);
}

const records = new Map();
const queue = [];
function visit(file, object) {
  if (Excluded.has(object.classId) || dropped.has(object)) return null;
  if (!records.has(object)) {
    const record = { file, object, id: BigInt(records.size + 2) };
    records.set(object, record);
    queue.push(record);
  }
  return records.get(object);
}

for (const object of scene.objects) if (object.classId === GameObject) visit(scene, object);

const kept = { components: 0, nulled: 0 };
while (queue.length) {
  const record = queue.pop();
  const { value, start } = parse(record.file, record.object);
  record.value = value;
  record.start = start;
  record.bytes = Buffer.from(record.file.data.subarray(start, start + record.object.size));
  for (const position of pointers(value)) {
    const at = position - start;
    const reference = target(record.file, position);
    if (!reference) {
      record.bytes.writeInt32LE(0, at);
      record.bytes.writeBigInt64LE(0n, at + 4);
    } else if (reference.external) {
      let index = engineFiles.indexOf(reference.external.path);
      if (index < 0) index = engineFiles.push(reference.external.path) - 1;
      record.bytes.writeInt32LE(index + 1, at);
      engineFiles[index] = reference.external.path;
      (record.engine ??= []).push(reference.external);
    } else {
      const object = reference.file.byPath.get(reference.pathId);
      const next = object ? visit(reference.file, object) : null;
      record.bytes.writeInt32LE(0, at);
      record.bytes.writeBigInt64LE(next ? next.id : 0n, at + 4);
      if (!next) kept.nulled++;
    }
  }

  if (record.object.classId === Transform && value.m_Children.length) {
    const children = value.m_Children.map((child) => child.__start - start);
    const live = children.filter((at) => record.bytes.readBigInt64LE(at + 4) !== 0n);
    if (live.length !== children.length) {
      const count = Buffer.alloc(4);
      count.writeInt32LE(live.length);
      record.bytes = Buffer.concat([
        record.bytes.subarray(0, children[0] - 4),
        count,
        ...live.map((at) => record.bytes.subarray(at, at + 12)),
        record.bytes.subarray(children[children.length - 1] + 12),
      ]);
    }
  }

  const stream = value.m_StreamData;
  if (stream && stream.size > 0) {
    const field = record.object.classId === Texture2D ? value["image data"] : record.object.classId === Mesh ? value.m_VertexData.m_DataSize : null;
    if (!field || field.length !== 0) throw new Error(`Class ${record.object.classId} object ${record.object.pathId} cannot inline its stream`);
    const payload = readStream(stream.path.split("/").pop()).subarray(stream.offset, stream.offset + stream.size);
    const fieldAt = field.start - start;
    const length = Buffer.alloc(4);
    length.writeInt32LE(payload.length);
    record.bytes = Buffer.concat([
      record.bytes.subarray(0, fieldAt),
      length,
      payload,
      Buffer.alloc((4 - (payload.length % 4)) % 4),
      record.bytes.subarray(fieldAt + 4, stream.__start - start),
      Buffer.alloc(16),
      record.bytes.subarray(stream.__end - start),
    ]);
  }
}

const all = [...records.values()];
const isRoot = (record) => {
  if (record.object.classId !== GameObject) return false;
  const transformPosition = pointers(record.value.m_Component).map((position) => target(record.file, position)).find((component) => {
    const object = component?.file?.byPath.get(component.pathId);
    return object?.classId === Transform;
  });
  if (!transformPosition) return false;
  const transform = records.get(transformPosition.file.byPath.get(transformPosition.pathId));
  const father = target(transform.file, transform.value.m_Father.__start);
  if (!father) return true;
  const fatherObject = father.file?.byPath.get(father.pathId);
  return !fatherObject || !records.has(fatherObject);
};
const roots = all.filter(isRoot);

const sink = [];
const int32 = (value) => { const b = Buffer.alloc(4); b.writeInt32LE(value); sink.push(b); };
const text = (value) => {
  const bytes = Buffer.from(value);
  int32(bytes.length);
  sink.push(bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4));
};
const pointer = (id) => { const b = Buffer.alloc(12); b.writeBigInt64LE(id, 4); sink.push(b); };
const assetInfo = (index, size, id) => { int32(index); int32(size); pointer(id); };

text(sceneName.toLowerCase());
int32(all.length);
for (const record of all) pointer(record.id);
int32(roots.length);
roots.forEach((record, index) => {
  text(`menu_root_${String(index).padStart(5, "0")}`);
  assetInfo(0, all.length, record.id);
});
assetInfo(0, 0, 0n);
int32(1);
text(sceneName.toLowerCase());
int32(0);
int32(0);
int32(0);
int32(7);
int32(0);
const bundleObject = Buffer.concat(sink);

const objects = [{ id: 1n, classId: AssetBundle, bytes: bundleObject }, ...all.map((record) => ({ id: record.id, classId: record.object.classId, bytes: record.bytes }))];
const classIds = [...new Set(objects.map((object) => object.classId))];
const metaParts = [Buffer.from(`${scene.unityVersion}\0`)];
const fixed = Buffer.alloc(9);
fixed.writeInt32LE(WebGLTarget, 0);
fixed[4] = 1;
fixed.writeInt32LE(classIds.length, 5);
metaParts.push(fixed, ...classIds.map((id) => layouts.get(id).raw));
let metaSize = metaParts.reduce((sum, part) => sum + part.length, 0);

const table = [];
const countAt = Buffer.alloc(4);
countAt.writeInt32LE(objects.length);
metaParts.push(countAt);
metaSize += 4;
let dataPosition = 0;
for (const object of objects) {
  const padding = (4 - ((48 + metaSize) % 4)) % 4;
  const entry = Buffer.alloc(padding + 24);
  entry.writeBigInt64LE(object.id, padding);
  entry.writeBigInt64LE(BigInt(dataPosition), padding + 8);
  entry.writeUInt32LE(object.bytes.length, padding + 16);
  entry.writeInt32LE(classIds.indexOf(object.classId), padding + 20);
  table.push(entry);
  metaSize += entry.length;
  object.offset = dataPosition;
  dataPosition += object.bytes.length;
  dataPosition += (8 - (dataPosition % 8)) % 8;
}
metaParts.push(...table);

const uniqueEngine = new Map();
for (const record of all) for (const external of record.engine ?? []) uniqueEngine.set(external.path, external);
const scripts = Buffer.alloc(4);
const externalCount = Buffer.alloc(4);
externalCount.writeInt32LE(engineFiles.length);
const externalParts = engineFiles.flatMap((path) => {
  const external = uniqueEngine.get(path);
  const type = Buffer.alloc(4);
  type.writeInt32LE(external.type);
  return [Buffer.from([0]), external.guid, type, Buffer.from(`${path}\0`)];
});
metaParts.push(scripts, externalCount, ...externalParts, Buffer.alloc(4), Buffer.from([0]));
const metadata = Buffer.concat(metaParts);

const dataOffset = Math.ceil((48 + metadata.length) / 4096) * 4096;
const serializedSize = dataOffset + dataPosition;
const serialized = Buffer.alloc(serializedSize);
serialized.writeUInt32BE(22, 8);
serialized.writeUInt32BE(metadata.length, 20);
serialized.writeBigInt64BE(BigInt(serializedSize), 24);
serialized.writeBigInt64BE(BigInt(dataOffset), 32);
metadata.copy(serialized, 48);
for (const object of objects) object.bytes.copy(serialized, dataOffset + object.offset);

const check = readSerializedFile(serialized);
if (check.objects.length !== objects.length || check.target !== WebGLTarget) throw new Error("Output failed to re-read");
for (const object of check.objects) {
  const layout = layouts.get(object.classId);
  const start = check.dataOffset + object.offset;
  const { end } = readObject(layout.tree, serialized, start, true);
  if (end !== start + object.size) throw new Error(`Output object ${object.pathId} class ${object.classId} walks to ${end - start}, table says ${object.size}`);
}

const nodeName = `CAB-${sceneName.toLowerCase()}`;
const info = Buffer.concat([
  Buffer.alloc(16),
  (() => { const b = Buffer.alloc(14); b.writeInt32BE(1, 0); b.writeUInt32BE(serializedSize, 4); b.writeUInt32BE(serializedSize, 8); return b; })(),
  (() => { const b = Buffer.alloc(24); b.writeInt32BE(1, 0); b.writeBigInt64BE(BigInt(serializedSize), 12); b.writeUInt32BE(4, 20); return b; })(),
  Buffer.from(`${nodeName}\0`),
]);
const signature = Buffer.from(`UnityFS\0`);
const versions = Buffer.from(`5.x.x\0${scene.unityVersion}\0`);
const fields = Buffer.alloc(4 + versions.length + 20);
fields.writeUInt32BE(8, 0);
versions.copy(fields, 4);
let headerSize = signature.length + fields.length;
headerSize += (16 - (headerSize % 16)) % 16;
const afterInfo = headerSize + info.length;
const dataPadding = (16 - (afterInfo % 16)) % 16;
const fieldsAt = 4 + versions.length;
fields.writeBigInt64BE(BigInt(afterInfo + dataPadding + serializedSize), fieldsAt);
fields.writeUInt32BE(info.length, fieldsAt + 8);
fields.writeUInt32BE(info.length, fieldsAt + 12);
fields.writeUInt32BE(0x40 | 0x200, fieldsAt + 16);
writeFileSync(output, Buffer.concat([signature, fields, Buffer.alloc(headerSize - signature.length - fields.length), info, Buffer.alloc(dataPadding), serialized]));

const counts = new Map();
for (const object of objects) counts.set(object.classId, (counts.get(object.classId) ?? 0) + 1);
console.log(`${sceneName}: ${objects.length} objects, ${roots.length} roots, ${dropped.size} terrain objects left out, ${kept.nulled} references cleared, ${serializedSize} bytes, from ${[...files.keys()].join(" ")}`);
console.log([...counts].map(([id, count]) => `${id}:${count}`).join(" "));
