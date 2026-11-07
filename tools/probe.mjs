import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "./serve.mjs";

const [root, seconds, logPath, shotPath, clickSpec] = process.argv.slice(2);
let nextClick = 0;
const chrome = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
const server = await serve(root, 0);
const profile = mkdtempSync(join(tmpdir(), "unturned-chrome-"));
const display = process.env.PROBE_REAL_GPU
  ? ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]
  : ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const browser = spawn(chrome, [...display, "--remote-debugging-port=0", `--window-size=${process.env.PROBE_WINDOW ?? "1280,720"}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

let page;
for (let i = 0; i < 100 && !page; i++) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const portFile = join(profile, "DevToolsActivePort");
  const port = existsSync(portFile) ? readFileSync(portFile, "utf8").split("\n")[0].trim() : "";
  if (port) page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((target) => target.type === "page" && target.url === "about:blank");
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => { socket.onopen = resolve; });
writeFileSync(logPath, "");
const logs = { push: (line) => appendFileSync(logPath, `${line}\n`) };
const pending = new Map();
let nextId = 1;
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    pending.get(message.id)?.(message);
  } else if (message.method === "Runtime.consoleAPICalled") {
    logs.push(`[${message.params.type}] ${message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ")}`);
  } else if (message.method === "Runtime.exceptionThrown") {
    logs.push(`[exception] ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`);
  }
};
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 60000);
    pending.set(id, (message) => { clearTimeout(timer); resolve(message.result); });
  });
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    const memory = { textures: new Map(), wasm: null, audio: 0 };
    for (const name of ["instantiate", "instantiateStreaming"]) {
      const original = WebAssembly[name];
      WebAssembly[name] = async (...args) => {
        const result = await original.apply(WebAssembly, args);
        memory.wasm = Object.values((result.instance ?? result).exports).find((value) => value instanceof WebAssembly.Memory) ?? memory.wasm;
        return result;
      };
    }
    const gl2 = WebGL2RenderingContext.prototype;
    const bound = new WeakMap();
    const bindTexture = gl2.bindTexture;
    gl2.bindTexture = function (target, texture) { bound.set(this, texture); return bindTexture.call(this, target, texture); };
    const account = (context, bytes, level) => {
      const texture = bound.get(context);
      if (!texture) return;
      const entry = memory.textures.get(texture) ?? { bytes: 0 };
      if (level === 0) entry.bytes = 0;
      entry.bytes += bytes;
      memory.textures.set(texture, entry);
    };
    const bytesPerPixel = { 0x83f0: 0.5, 0x83f1: 0.5, 0x83f2: 1, 0x83f3: 1, 0x8c4c: 0.5, 0x8c4d: 0.5, 0x8c4e: 1, 0x8c4f: 1, 0x8058: 4, 0x8c43: 4, 0x8051: 4, 0x881a: 8, 0x8229: 1, 0x822b: 2, 0x88f0: 4, 0x8d62: 2, 0x8056: 2, 0x822d: 2, 0x8814: 16, 0x8c3a: 4, 0x81a6: 4, 0x8cac: 4 };
    const texStorage2D = gl2.texStorage2D;
    gl2.texStorage2D = function (target, levels, format, width, height) {
      const texture = bound.get(this);
      const perPixel = bytesPerPixel[format] ?? 4;
      if (texture) memory.textures.set(texture, { bytes: width * height * perPixel * (levels > 1 ? 1.33 : 1) * (target === this.TEXTURE_CUBE_MAP ? 6 : 1), format: format.toString(16), width, height });
      return texStorage2D.apply(this, arguments);
    };
    const compressedTexImage2D = gl2.compressedTexImage2D;
    gl2.compressedTexImage2D = function (target, level, format, width, height, border, data) {
      account(this, data?.byteLength ?? 0, level);
      return compressedTexImage2D.apply(this, arguments);
    };
    const texImage2D = gl2.texImage2D;
    gl2.texImage2D = function (target, level, format, width, height) {
      if (arguments.length >= 9) account(this, width * height * 4, level);
      return texImage2D.apply(this, arguments);
    };
    const deleteTexture = gl2.deleteTexture;
    gl2.deleteTexture = function (texture) { memory.textures.delete(texture); return deleteTexture.call(this, texture); };
    const decodeForMemory = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (...args) {
      const result = decodeForMemory.apply(this, args);
      result?.then?.((buffer) => { memory.audio += buffer.length * buffer.numberOfChannels * 4; });
      return result;
    };
    window.memoryReport = () => {
      let textures = 0;
      const formats = {};
      const sizes = {};
      for (const entry of memory.textures.values()) {
        textures += entry.bytes;
        const format = formats[entry.format ?? "upload"] ??= { count: 0, mb: 0 };
        format.count++;
        format.mb += entry.bytes / 1048576;
        if (entry.width) {
          const size = Math.max(entry.width, entry.height);
          const bucket = sizes[size] ??= { count: 0, mb: 0 };
          bucket.count++;
          bucket.mb += entry.bytes / 1048576;
        }
      }
      for (const group of [...Object.values(formats), ...Object.values(sizes)]) group.mb = Math.round(group.mb);
      const mb = (bytes) => Math.round(bytes / 1048576);
      const metrics = window.unturned?.GetMetricsInfo?.();
      console.log("[memory] " + JSON.stringify({ jsHeap: mb(performance.memory.usedJSHeapSize), wasm: memory.wasm ? mb(memory.wasm.buffer.byteLength) : null, wasmUsed: metrics ? mb(metrics.usedWASMHeapSize) : null, textures: mb(textures), textureCount: memory.textures.size, decodedAudio: mb(memory.audio), formats, sizes }));
    };
    let callbackTimes = [];
    const nativeFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => nativeFrame((now) => {
      const began = performance.now();
      callback(now);
      callbackTimes.push(performance.now() - began);
    });
    window.measureFrames = (seconds) => {
      const times = [];
      const start = performance.now();
      callbackTimes = [];
      const tick = (now) => {
        times.push(now);
        if (now - start < seconds * 1000) return requestAnimationFrame(tick);
        const gaps = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
        const canvas = document.getElementById("game");
        const busy = [...callbackTimes].sort((a, b) => a - b);
        console.log("[fps] " + JSON.stringify({ busyP95Ms: +busy[Math.floor(busy.length * 0.95)].toFixed(1), at: Math.round(performance.now() / 1000), fps: +(1000 * (times.length - 1) / (times[times.length - 1] - times[0])).toFixed(1), medianMs: +gaps[gaps.length >> 1].toFixed(1), p95Ms: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1), worstMs: +gaps[gaps.length - 1].toFixed(1), over33ms: gaps.filter((gap) => gap > 33).length, over100ms: gaps.filter((gap) => gap > 100).length, canvas: [canvas.width, canvas.height], heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, visible: document.visibilityState }));
      };
      requestAnimationFrame(tick);
    };
    window.countGl = (seconds) => {
      const proto = WebGL2RenderingContext.prototype;
      const counts = {};
      const programs = new Map();
      let current = null;
      const restore = ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "useProgram", "bindFramebuffer", "bindTexture", "activeTexture", "uniform4fv", "uniformMatrix4fv", "enable", "disable", "clear", "blitFramebuffer"].map((name) => {
        const original = proto[name];
        proto[name] = function (...args) {
          counts[name] = (counts[name] ?? 0) + 1;
          if (name === "useProgram") current = args[0];
          if (name.startsWith("draw")) programs.set(current, (programs.get(current) ?? 0) + 1);
          return original.apply(this, args);
        };
        return () => { proto[name] = original; };
      });
      let frames = 0;
      const start = performance.now();
      const tick = (now) => {
        frames++;
        if (now - start < seconds * 1000) return requestAnimationFrame(tick);
        restore.forEach((undo) => undo());
        const perFrame = Object.fromEntries(Object.entries(counts).map(([name, count]) => [name, Math.round(count / frames)]));
        console.log("[gl] " + JSON.stringify({ frames, perFrame, programs: programs.size, topProgramDraws: [...programs.values()].sort((a, b) => b - a).slice(0, 8).map((count) => Math.round(count / frames)) }));
      };
      requestAnimationFrame(tick);
    };
    window.captureGlFrame = () => {
      const proto = WebGL2RenderingContext.prototype;
      const runs = [];
      const meshes = new Map();
      const programs = new Map();
      let framebuffer = 0;
      let framebuffers = 0;
      const ids = new Map();
      const idOf = (object) => {
        if (!object) return 0;
        if (!ids.has(object)) ids.set(object, ids.size + 1);
        return ids.get(object);
      };
      let program = null;
      const restore = [];
      const wrap = (name, before) => {
        const original = proto[name];
        proto[name] = function (...args) {
          before.call(this, ...args);
          return original.apply(this, args);
        };
        restore.push(() => { proto[name] = original; });
      };
      wrap("useProgram", (next) => { program = next; });
      wrap("bindFramebuffer", (target, next) => { framebuffer = idOf(next); framebuffers++; });
      wrap("drawElements", function (mode, count, type, offset) {
        const key = framebuffer + "/" + idOf(program);
        const last = runs[runs.length - 1];
        if (last && last.key === key) last.draws++;
        else runs.push({ key, draws: 1 });
        const mesh = idOf(this.getParameter(this.ELEMENT_ARRAY_BUFFER_BINDING)) + ":" + offset + ":" + count;
        meshes.set(mesh, (meshes.get(mesh) ?? 0) + 1);
        if (!programs.has(program)) programs.set(program, { draws: 0, indices: 0 });
        const stats = programs.get(program);
        stats.draws++;
        stats.indices += count;
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        restore.forEach((undo) => undo());
        const gl = document.getElementById("game").getContext("webgl2");
        const repeats = {};
        for (const count of meshes.values()) repeats[count] = (repeats[count] ?? 0) + 1;
        console.log("[glframe] " + JSON.stringify({ framebuffers, distinctMeshes: meshes.size, meshesByRepeatCount: repeats, runs: runs.slice(0, 120).map((run) => run.key + "x" + run.draws) }));
        [...programs].sort((a, b) => b[1].draws - a[1].draws).slice(0, 8).forEach(([linked, stats]) => {
          const shaders = gl.getAttachedShaders(linked).map((shader) => gl.getShaderSource(shader));
          const defines = shaders.flatMap((source) => source.match(/#define [A-Z_0-9]+( 1)?/g) ?? []);
          console.log("[glprogram] " + JSON.stringify({ id: idOf(linked), ...stats, defines: [...new Set(defines)].map((line) => line.replace("#define ", "").replace(" 1", "")), head: shaders[1].slice(0, 200) }));
        });
      }));
    };
    window.audioStats = { decoded: 0, failed: 0, decodedSeconds: 0, started: 0, peak: 0 };
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (...args) {
      const result = decode.apply(this, args);
      if (result && result.then) result.then(
        (buffer) => { audioStats.decoded++; audioStats.decodedSeconds += buffer.duration; },
        () => { audioStats.failed++; }
      );
      return result;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      audioStats.started++;
      if (this.buffer) {
        const samples = this.buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i += 64) audioStats.peak = Math.max(audioStats.peak, Math.abs(samples[i]));
      }
      return start.apply(this, args);
    };
  `,
});
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/index.html` });
const clicks = (clickSpec ?? "").split(";").filter(Boolean).map((spec) => {
  const [action, at] = spec.split("@");
  if (action.startsWith("js:")) return { expression: action.slice(3), at: Number(at) };
  if (action.startsWith("profile:")) return { profile: Number(action.slice(8)), at: Number(at) };
  if (action === "snapshot") return { snapshot: true, at: Number(at) };
  if (action.startsWith("key:")) {
    const [, code, key, virtualCode, hold] = action.split(":");
    return { keyPress: { code, key, windowsVirtualKeyCode: Number(virtualCode) }, hold: Number(hold), at: Number(at) };
  }
  const [x, y] = action.split(",").map(Number);
  return { x, y, at: Number(at) };
});

async function profileFor(seconds) {
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 500 });
  await send("Profiler.start");
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  const result = await send("Profiler.stop");
  if (!result) {
    logs.push("[profile] no response");
    return;
  }
  const { nodes, samples, timeDeltas } = result.profile;
  const names = new Map(nodes.map((node) => [node.id, node.callFrame.functionName || "(anonymous)"]));
  const self = new Map();
  let total = 0;
  samples.forEach((id, index) => {
    const delta = timeDeltas[index] / 1000;
    total += delta;
    self.set(names.get(id), (self.get(names.get(id)) ?? 0) + delta);
  });
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 30);
  logs.push(`[profile] total ${total.toFixed(0)} ms over ${seconds}s\n${top.map(([name, ms]) => `  ${ms.toFixed(0).padStart(7)} ms ${(100 * ms / total).toFixed(1).padStart(5)}%  ${name}`).join("\n")}`);
}

async function takeSnapshot(index) {
  const chunks = [];
  const collect = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "HeapProfiler.addHeapSnapshotChunk") chunks.push(message.params.chunk);
  };
  socket.addEventListener("message", collect);
  await send("HeapProfiler.enable");
  await send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  socket.removeEventListener("message", collect);
  writeFileSync(shotPath.replace(/\.png$/, `-${index}.heapsnapshot`), chunks.join(""));
  logs.push(`[probe] heap snapshot ${index} written`);
}

async function click({ x, y, keyPress, hold, expression, profile, snapshot }, index) {
  if (snapshot) {
    await takeSnapshot(index);
    return;
  }
  if (profile) {
    await profileFor(profile);
    return;
  }
  if (expression) {
    await send("Runtime.evaluate", { expression });
    logs.push(`[probe] evaluated ${expression}`);
    if (process.env.PROBE_NO_SHOTS) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const evalShot = await send("Page.captureScreenshot", { format: "png" });
    if (evalShot) writeFileSync(shotPath.replace(/\.png$/, `-${index}.png`), Buffer.from(evalShot.data, "base64"));
    return;
  }
  if (keyPress) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...keyPress });
    await new Promise((resolve) => setTimeout(resolve, hold * 1000));
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...keyPress });
    logs.push(`[probe] held ${keyPress.code} for ${hold}s`);
    const keyShot = await send("Page.captureScreenshot", { format: "png" });
    if (keyShot) writeFileSync(shotPath.replace(/\.png$/, `-${index}.png`), Buffer.from(keyShot.data, "base64"));
    return;
  }
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  logs.push(`[probe] clicked ${x},${y}`);
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  if (shot) writeFileSync(shotPath.replace(/\.png$/, `-${index}.png`), Buffer.from(shot.data, "base64"));
}

const started = Date.now();
while (Date.now() - started < Number(seconds) * 1000) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  while (clicks.length && clicks[0].at * 1000 <= Date.now() - started) {
    await click(clicks.shift(), nextClick++);
  }
  const before = Date.now();
  const beat = await send("Runtime.evaluate", { expression: "document.getElementById('status').textContent", returnByValue: true });
  logs.push(`[probe] t=${Math.round((Date.now() - started) / 1000)}s page answered in ${Date.now() - before} ms: ${beat?.result?.value ?? "no response"}`);
}

const audio = await send("Runtime.evaluate", { expression: "JSON.stringify(window.audioStats)", returnByValue: true });
logs.push(`[probe] audio ${audio?.result?.value ?? "no response"}`);
const state = await send("Runtime.evaluate", { expression: `document.getElementById("status").hidden + " | " + document.getElementById("status").textContent`, returnByValue: true });
logs.push(`[probe] status hidden | text: ${state?.result?.value ?? "page did not respond"}`);
const gameLog = await send("Runtime.evaluate", {
  expression: `(() => { const files = window.unturnedFiles; if (!files) return "game log reader unavailable"; const out = ["/game: " + files.list("/game").join(" ")]; let names = []; try { names = files.list("/game/Logs"); } catch (e) { out.push("/game/Logs: " + e); } for (const name of names) { if (name === "." || name === "..") continue; out.push("=== " + name); out.push(files.read("/game/Logs/" + name)); } return out.join("\\n"); })()`,
  returnByValue: true,
});
logs.push(`[probe] game log:\n${gameLog?.result?.value ?? "page did not respond"}`);
const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot) writeFileSync(shotPath, Buffer.from(shot.data, "base64"));

socket.close();
browser.kill();
server.close();
server.closeAllConnections();
await new Promise((resolve) => setTimeout(resolve, 500));
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
