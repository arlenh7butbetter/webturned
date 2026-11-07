const HEADER_SIZE = 64;

function hex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function validPath(path) {
  return !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..");
}

async function readRange(url, start, end, whole) {
  if (start === end) return new Uint8Array(0);
  if (whole.bytes) return whole.bytes.subarray(start, end);
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
  if (!response.ok) throw new Error(`Package request failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (response.status === 206) return bytes;
  whole.bytes = bytes;
  return bytes.subarray(start, end);
}

export async function openPackage(url) {
  const whole = {};
  const header = await readRange(url, 0, HEADER_SIZE, whole);
  if (new TextDecoder().decode(header.subarray(0, 8)) !== "UNTURNED") throw new Error("Not an Unturned package");

  const view = new DataView(header.buffer, header.byteOffset, HEADER_SIZE);
  const version = view.getUint32(8, true);
  if (version !== 1) throw new Error(`Unsupported package version ${version}`);

  const manifestOffset = Number(view.getBigUint64(16, true));
  const manifestLength = Number(view.getBigUint64(24, true));
  const compressed = await readRange(url, manifestOffset, manifestOffset + manifestLength, whole);
  const digest = hex(await crypto.subtle.digest("SHA-256", compressed));
  if (digest !== hex(header.subarray(32, 64))) throw new Error("Package manifest failed its integrity check");

  const manifest = JSON.parse(new TextDecoder().decode(await inflate(compressed)));
  const entries = new Map();
  for (const entry of manifest.entries) {
    if (!validPath(entry.path)) throw new Error(`Invalid package path ${entry.path}`);
    entries.set(entry.path, entry);
  }

  let span = null;

  async function preload(list) {
    const start = Math.min(...list.map((entry) => entry.offset));
    const end = Math.max(...list.map((entry) => entry.offset + entry.stored));
    span = { start, end, bytes: await readRange(url, start, end, whole) };
  }

  function release() {
    span = null;
  }

  async function read(path) {
    const entry = entries.get(path);
    if (!entry) throw new Error(`Package has no entry ${path}`);
    const stored = span && entry.offset >= span.start && entry.offset + entry.stored <= span.end
      ? span.bytes.subarray(entry.offset - span.start, entry.offset - span.start + entry.stored)
      : await readRange(url, entry.offset, entry.offset + entry.stored, whole);
    const data = entry.method === "deflate" ? await inflate(stored) : stored;
    if (data.length !== entry.size) throw new Error(`Package entry ${path} has the wrong length`);
    if (hex(await crypto.subtle.digest("SHA-256", data)) !== entry.sha256) throw new Error(`Package entry ${path} failed its integrity check`);
    return data;
  }

  return { build: manifest.build, entries, preload, release, read };
}
