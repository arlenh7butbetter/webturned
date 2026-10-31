import { readFileSync } from "node:fs";

const commonStrings = new Map(Object.entries({
  0: "AABB", 5: "AnimationClip", 19: "AnimationCurve", 34: "AnimationState", 49: "Array", 55: "Base", 60: "BitField", 69: "bitset", 76: "bool", 81: "char",
  86: "ColorRGBA", 96: "Component", 106: "data", 111: "deque", 117: "double", 124: "dynamic_array", 138: "FastPropertyName", 155: "first", 161: "float",
  167: "Font", 172: "GameObject", 183: "Generic Mono", 196: "GradientNEW", 208: "GUID", 213: "GUIStyle", 222: "int", 226: "list", 231: "long long",
  241: "map", 245: "Matrix4x4f", 256: "MdFour", 263: "MonoBehaviour", 277: "MonoScript", 288: "m_ByteSize", 299: "m_Curve", 307: "m_EditorClassIdentifier",
  331: "m_EditorHideFlags", 349: "m_Enabled", 359: "m_ExtensionPtr", 374: "m_GameObject", 387: "m_Index", 395: "m_IsArray", 405: "m_IsStatic", 416: "m_MetaFlag",
  427: "m_Name", 434: "m_ObjectHideFlags", 452: "m_PrefabInternal", 469: "m_PrefabParentObject", 490: "m_Script", 499: "m_StaticEditorFlags", 519: "m_Type",
  526: "m_Version", 536: "Object", 543: "pair", 548: "PPtr<Component>", 564: "PPtr<GameObject>", 581: "PPtr<Material>", 596: "PPtr<MonoBehaviour>",
  616: "PPtr<MonoScript>", 633: "PPtr<Object>", 646: "PPtr<Prefab>", 659: "PPtr<Sprite>", 672: "PPtr<TextAsset>", 688: "PPtr<Texture>", 702: "PPtr<Texture2D>",
  718: "PPtr<Transform>", 734: "Prefab", 741: "Quaternionf", 753: "Rectf", 759: "RectInt", 767: "RectOffset", 778: "second", 785: "set", 789: "short", 795: "size",
  800: "SInt16", 807: "SInt32", 814: "SInt64", 821: "SInt8", 827: "staticvector", 840: "string", 847: "TextAsset", 857: "TextMesh", 866: "Texture", 874: "Texture2D",
  884: "Transform", 894: "TypelessData", 907: "UInt16", 914: "UInt32", 921: "UInt64", 928: "UInt8", 934: "unsigned int", 947: "unsigned long long", 966: "unsigned short",
  981: "vector", 988: "Vector2f", 997: "Vector3f", 1006: "Vector4f", 1015: "m_ScriptingClassIdentifier", 1042: "Gradient", 1051: "Type*", 1057: "int2_storage",
  1070: "int3_storage", 1083: "BoundsInt", 1093: "m_CorrespondingSourceObject", 1121: "m_PrefabInstance", 1138: "m_PrefabAsset", 1152: "FileSize", 1161: "Hash128",
}).map(([key, value]) => [Number(key), value]));

const primitiveSizes = {
  bool: 1, char: 1, SInt8: 1, UInt8: 1, short: 2, SInt16: 2, UInt16: 2, "unsigned short": 2, int: 4, SInt32: 4, UInt32: 4, "unsigned int": 4,
  Type: 4, float: 4, double: 8, long: 8, "long long": 8, SInt64: 8, UInt64: 8, FileSize: 8, "unsigned long long": 8,
};

const AlignAfter = 0x4000;

export class Cursor {
  constructor(buffer, position = 0, littleEndian = false) {
    this.buffer = buffer;
    this.position = position;
    this.littleEndian = littleEndian;
  }
  u8() { return this.buffer[this.position++]; }
  u16() { const v = this.littleEndian ? this.buffer.readUInt16LE(this.position) : this.buffer.readUInt16BE(this.position); this.position += 2; return v; }
  u32() { const v = this.littleEndian ? this.buffer.readUInt32LE(this.position) : this.buffer.readUInt32BE(this.position); this.position += 4; return v; }
  i32() { const v = this.littleEndian ? this.buffer.readInt32LE(this.position) : this.buffer.readInt32BE(this.position); this.position += 4; return v; }
  i64() { const v = this.littleEndian ? this.buffer.readBigInt64LE(this.position) : this.buffer.readBigInt64BE(this.position); this.position += 8; return Number(v); }
  skip(count) { this.position += count; }
  align(size) { const remainder = this.position % size; if (remainder) this.position += size - remainder; }
  cstring() {
    const end = this.buffer.indexOf(0, this.position);
    const value = this.buffer.toString("utf8", this.position, end);
    this.position = end + 1;
    return value;
  }
}

export function decodeLz4(stored, size) {
  const output = Buffer.alloc(size);
  let read = 0;
  let written = 0;
  while (read < stored.length) {
    const token = stored[read++];
    let literals = token >> 4;
    if (literals === 15) {
      let extra;
      do { extra = stored[read++]; literals += extra; } while (extra === 255);
    }
    stored.copy(output, written, read, read + literals);
    read += literals;
    written += literals;
    if (read >= stored.length) break;
    const distance = stored[read] | (stored[read + 1] << 8);
    read += 2;
    let length = token & 15;
    if (length === 15) {
      let extra;
      do { extra = stored[read++]; length += extra; } while (extra === 255);
    }
    length += 4;
    for (let i = 0; i < length; i++, written++) output[written] = output[written - distance];
  }
  if (written !== size) throw new Error(`Blocks info decoded to ${written} bytes, expected ${size}`);
  return output;
}

function readRawBundle(buffer, cursor) {
  cursor.skip(4);
  const header = { version: 8, playerVersion: cursor.cstring(), engineVersion: cursor.cstring() };
  cursor.skip(4);
  const dataStart = cursor.u32();
  cursor.position = dataStart;
  const nodes = [];
  const nodeCount = cursor.u32();
  for (let i = 0; i < nodeCount; i++) {
    const name = cursor.cstring();
    const offset = cursor.u32();
    const size = cursor.u32();
    const serialized = !/\.(resS|resource)$/.test(name);
    nodes.push({ name, flags: serialized ? 4 : 0, data: buffer.subarray(dataStart + offset, dataStart + offset + size) });
  }
  return { header, nodes };
}

export function readBundle(path) {
  const buffer = readFileSync(path);
  const cursor = new Cursor(buffer);
  const signature = cursor.cstring();
  if (signature === "UnityRaw") return readRawBundle(buffer, cursor);
  if (signature !== "UnityFS") throw new Error(`${path} is not a UnityFS bundle`);
  const version = cursor.u32();
  const header = { version, playerVersion: cursor.cstring(), engineVersion: cursor.cstring() };
  cursor.skip(8);
  const infoStored = cursor.u32();
  const infoSize = cursor.u32();
  const flags = cursor.u32();
  if (version >= 7) cursor.align(16);

  const atEnd = (flags & 0x80) !== 0;
  const headerEnd = cursor.position;
  const infoStart = atEnd ? buffer.length - infoStored : headerEnd;
  const storedInfo = buffer.subarray(infoStart, infoStart + infoStored);
  const compression = flags & 0x3f;
  if (compression !== 0 && compression !== 2 && compression !== 3) throw new Error(`Unsupported blocks info compression ${compression}`);
  const info = new Cursor(compression === 0 ? storedInfo : decodeLz4(storedInfo, infoSize));

  cursor.position = atEnd ? headerEnd : headerEnd + infoStored;
  if (flags & 0x200) cursor.align(16);
  const dataStart = cursor.position;

  info.skip(16);
  const blockCount = info.i32();
  for (let i = 0; i < blockCount; i++) {
    info.skip(8);
    if (info.u16() & 0x3f) throw new Error(`${path} has compressed data blocks`);
  }
  const nodes = [];
  const nodeCount = info.i32();
  for (let i = 0; i < nodeCount; i++) {
    const offset = info.i64();
    const size = info.i64();
    const nodeFlags = info.u32();
    const name = info.cstring();
    nodes.push({ name, flags: nodeFlags, data: buffer.subarray(dataStart + offset, dataStart + offset + size) });
  }
  return { header, nodes };
}

function readTypeTree(cursor, version) {
  const blobEnd = version >= 23 ? cursor.position + 4 + cursor.buffer.readUInt32LE(cursor.position) : 0;
  if (version >= 23) cursor.skip(12);
  const nodeCount = cursor.i32();
  const stringSize = cursor.i32();
  const start = cursor.position;
  const strings = cursor.buffer.subarray(start + nodeCount * 32, start + nodeCount * 32 + stringSize);
  const text = (value) => {
    if (value & 0x80000000) return commonStrings.get(value & 0x7fffffff) ?? `common:${value & 0x7fffffff}`;
    return strings.toString("utf8", value, strings.indexOf(0, value));
  };
  const flat = [];
  for (let i = 0; i < nodeCount; i++) {
    cursor.skip(2);
    const level = cursor.u8();
    cursor.skip(1);
    const type = text(cursor.u32());
    const name = text(cursor.u32());
    const size = cursor.i32();
    cursor.skip(4);
    const metaFlags = cursor.i32();
    cursor.skip(8);
    flat.push({ level, type, name, size, align: (metaFlags & AlignAfter) !== 0, children: [] });
  }
  cursor.position = version >= 23 ? blobEnd : start + nodeCount * 32 + stringSize;
  const stack = [];
  for (const node of flat) {
    stack.length = node.level;
    if (node.level > 0) stack[node.level - 1].children.push(node);
    stack[node.level] = node;
  }
  return flat[0];
}

export function readSerializedFile(data) {
  const head = new Cursor(data);
  head.skip(8);
  const version = head.u32();
  head.skip(4);
  if (version < 22) throw new Error(`Unsupported serialized file version ${version}`);
  const bigEndian = head.u8() !== 0;
  head.skip(3);
  const metadataSize = head.u32();
  const fileSize = head.i64();
  const dataOffset = head.i64();
  head.skip(8);

  const meta = new Cursor(data, head.position, !bigEndian);
  const unityVersion = meta.cstring();
  const targetPosition = meta.position;
  const target = meta.i32();
  const hasTypeTree = meta.u8() !== 0;

  const types = [];
  const typeCount = meta.i32();
  for (let i = 0; i < typeCount; i++) {
    const rawStart = meta.position;
    const classId = meta.i32();
    meta.skip(1);
    const scriptIndex = meta.u16();
    if (classId === 114 || version >= 23) meta.skip(16);
    meta.skip(16);
    const tree = hasTypeTree ? readTypeTree(meta, version) : null;
    if (hasTypeTree) {
      const dependencies = meta.i32();
      meta.skip(dependencies * 4);
    }
    types.push({ classId, scriptIndex, tree, raw: data.subarray(rawStart, meta.position) });
  }

  const objects = [];
  const objectCount = meta.i32();
  for (let i = 0; i < objectCount; i++) {
    meta.align(4);
    const pathId = meta.buffer.readBigInt64LE(meta.position);
    meta.skip(8);
    const offset = meta.i64();
    const size = meta.u32();
    const typeIndex = meta.i32();
    objects.push({ pathId, offsetPosition: meta.position - 16, offset, size, typeIndex, classId: types[typeIndex].classId });
  }

  const scriptCount = meta.i32();
  meta.skip(scriptCount * 12);
  const externals = [];
  const externalCount = meta.i32();
  for (let i = 0; i < externalCount; i++) {
    meta.cstring();
    const guid = data.subarray(meta.position, meta.position + 16);
    meta.skip(16);
    const type = meta.i32();
    externals.push({ guid, type, path: meta.cstring() });
  }

  return { version, bigEndian, metadataSize, fileSize, dataOffset, unityVersion, target, targetPosition, hasTypeTree, types, objects, externals, littleEndian: !bigEndian };
}

export function readObject(node, data, position, littleEndian) {
  const cursor = new Cursor(data, position, littleEndian);
  const value = readValue(node, cursor);
  return { value, end: cursor.position };
}

function readValue(node, cursor) {
  let value;
  if (node.type === "string") {
    const length = cursor.i32();
    value = cursor.buffer.toString("utf8", cursor.position, cursor.position + length);
    cursor.skip(length);
    cursor.align(4);
  } else if (primitiveSizes[node.type] && node.children.length === 0) {
    const size = primitiveSizes[node.type];
    if (size === 8) value = cursor.i64();
    else if (size === 4) value = node.type === "float" ? cursor.buffer.readFloatLE((cursor.position += 4) - 4) : cursor.i32();
    else if (size === 2) value = cursor.u16();
    else value = cursor.u8();
  } else if (node.type === "TypelessData") {
    const length = cursor.i32();
    value = { start: cursor.position - 4, length };
    cursor.skip(length);
  } else if (node.children.length === 1 && node.children[0].name === "Array") {
    value = readArray(node.children[0], cursor);
  } else if (node.name === "Array" || node.type === "Array") {
    value = readArray(node, cursor);
  } else {
    value = { __start: cursor.position, __at: {} };
    for (const child of node.children) {
      value.__at[child.name] = cursor.position;
      value[child.name] = readValue(child, cursor);
    }
    value.__end = cursor.position;
  }
  if (node.align) cursor.align(4);
  return value;
}

function readArray(node, cursor) {
  const count = cursor.i32();
  const element = node.children[1];
  if (primitiveSizes[element.type] === 1) {
    const start = cursor.position;
    cursor.skip(count);
    if (node.align) cursor.align(4);
    return { start: start - 4, length: count };
  }
  const items = [];
  for (let i = 0; i < count; i++) items.push(readValue(element, cursor));
  if (node.align) cursor.align(4);
  return items;
}
