import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { openPackage } from "../web/package.js";
import { serve } from "../tools/serve.mjs";

const root = join(import.meta.dirname, "..");
const work = mkdtempSync(join(tmpdir(), "unturned-package-"));
const packagePath = join(work, "game.unturned");
const files = {
  "a/text.txt": Buffer.from("x".repeat(100000)),
  "a/b/random.bin": Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 2654435761) >>> 24)),
  "image.png": Buffer.from("already compressed"),
  "empty.dat": Buffer.alloc(0),
};
let server;
let url;

before(async () => {
  for (const [path, data] of Object.entries(files)) {
    const file = join(work, "input", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
  execFileSync("dotnet", ["build", join(root, "tools", "Packer"), "-c", "Release", "--nologo", "-v", "q", "--nodeReuse:false", "-p:UseSharedCompilation=false"], { stdio: "inherit" });
  execFileSync("dotnet", [join(root, "build", "tools", "Packer", "bin", "Packer.dll"), packagePath, `game=${join(work, "input")}@data`], { stdio: "inherit" });
  server = await serve(work, 0);
  url = `http://127.0.0.1:${server.address().port}/game.unturned`;
});

after(() => {
  server.close();
  server.closeAllConnections();
  rmSync(work, { recursive: true, force: true });
});

test("every entry round-trips", async () => {
  const pkg = await openPackage(url);
  assert.equal(pkg.entries.size, Object.keys(files).length);
  for (const [path, data] of Object.entries(files)) {
    assert.deepEqual(Buffer.from(await pkg.read(`data/${path}`)), data);
  }
});

test("compresses text and stores compressed formats", async () => {
  const pkg = await openPackage(url);
  assert.equal(pkg.entries.get("data/a/text.txt").method, "deflate");
  assert.ok(pkg.entries.get("data/a/text.txt").stored < 1000);
  assert.equal(pkg.entries.get("data/image.png").method, "store");
});

async function withBytes(mutate) {
  const bytes = Buffer.from(readFileSync(packagePath));
  mutate(bytes);
  const name = "mutated.unturned";
  writeFileSync(join(work, name), bytes);
  return `http://127.0.0.1:${server.address().port}/${name}`;
}

test("rejects a bad magic", async () => {
  await assert.rejects(openPackage(await withBytes((b) => { b[0] = 0; })), /Not an Unturned package/);
});

test("rejects an unknown version", async () => {
  await assert.rejects(openPackage(await withBytes((b) => { b[8] = 2; })), /Unsupported package version 2/);
});

test("rejects a corrupted manifest", async () => {
  await assert.rejects(openPackage(await withBytes((b) => { b[b.length - 1] ^= 0xff; })), /manifest failed/);
});

test("rejects a corrupted stored entry", async () => {
  const pkg = await openPackage(url);
  const entry = pkg.entries.get("data/image.png");
  const mutated = await openPackage(await withBytes((b) => { b[entry.offset] ^= 0xff; }));
  await assert.rejects(mutated.read("data/image.png"), /integrity check/);
});

test("reports a missing entry", async () => {
  const pkg = await openPackage(url);
  await assert.rejects(pkg.read("data/nope"), /no entry/);
});
