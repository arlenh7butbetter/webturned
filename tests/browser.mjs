import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../tools/serve.mjs";

const dist = process.argv[2];
const screenshotDir = process.argv[3] ?? join(dist, "..", "logs");
const chrome = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
if (!chrome) throw new Error("Chrome or Edge is required");

function fail(message) {
  throw new Error(message);
}

const server = await serve(dist, 0);
const profile = mkdtempSync(join(tmpdir(), "unturned-chrome-"));
const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=1280,720", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

async function debuggerUrl() {
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100; i++) {
    if (existsSync(portFile)) {
      const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
      if (port) {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = targets.find((target) => target.type === "page");
        if (page) return page.webSocketDebuggerUrl;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail("Browser did not open its debugging port");
}

const socket = new WebSocket(await debuggerUrl());
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

let nextId = 1;
const pending = new Map();
const logs = [];
const errors = [];
const waiters = [];

socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  } else if (message.method === "Runtime.consoleAPICalled") {
    const text = message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
    logs.push(text);
    if (message.params.type === "error") errors.push(text);
    for (const waiter of waiters.splice(0)) waiter();
  } else if (message.method === "Runtime.exceptionThrown") {
    errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    for (const waiter of waiters.splice(0)) waiter();
  }
};

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} got no response in 90 s`)), 90000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
  });
}

async function waitForLog(pattern, timeout, from = 0) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const line = logs.slice(from).find((text) => pattern.test(text));
    if (line) return line;
    if (errors.length) fail(`Page error before ${pattern}: ${errors[0]}`);
    const remaining = deadline - Date.now();
    if (remaining <= 0) fail(`Timed out waiting for ${pattern}. Last logs:\n${logs.slice(-15).join("\n")}`);
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, Math.min(remaining, 1000));
      waiters.push(() => { clearTimeout(timer); resolve(); });
    });
  }
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(screenshotDir, name), Buffer.from(data, "base64"));
}

async function reportPosition() {
  const from = logs.length;
  await send("Runtime.evaluate", { expression: `window.unturned.SendMessage("Player", "ReportPosition")` });
  const line = await waitForLog(/\[slice\] position=/, 30000, from);
  const [x, y, z] = /position=([-\d.]+),([-\d.]+),([-\d.]+)/.exec(line).slice(1).map(Number);
  return { x, y, z, grounded: /grounded=True/.test(line) };
}

async function key(type, code, keyName, virtualCode) {
  await send("Input.dispatchKeyEvent", { type, code, key: keyName, windowsVirtualKeyCode: virtualCode });
}

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/index.html?map=PEI` });

  const ready = await waitForLog(/\[slice\] map=/, 240000);
  console.log(ready);
  const [, map, tiles, spawnY, ground] = /map=(\S+) tiles=(\d+) spawn=[-\d.]+,([-\d.]+),[-\d.]+ ground=(\S+)/.exec(ready);
  if (Number(tiles) <= 0) fail("No terrain tiles were created");
  const distance = Math.abs(Number(ground) - Number(spawnY));
  if (!(distance < 3)) fail(`Spawn on ${map} is ${distance} m from the ground, expected under 3 m`);

  await new Promise((resolve) => setTimeout(resolve, 8000));
  const start = await reportPosition();
  console.log("settled", start);
  if (!start.grounded) fail("Player did not land on the terrain");
  await screenshot("slice-before.png");

  await send("Runtime.evaluate", { expression: `document.getElementById("game").focus()` });
  await key("keyDown", "KeyW", "w", 87);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await key("keyUp", "KeyW", "w", 87);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const end = await reportPosition();
  console.log("after walking", end);
  await screenshot("slice-after.png");
  const moved = Math.hypot(end.x - start.x, end.z - start.z);
  if (moved < 1) fail(`Player moved ${moved} m while W was held`);
  console.log(`PASS moved ${moved.toFixed(2)} m, screenshots in ${screenshotDir}`);
} finally {
  writeFileSync(join(screenshotDir, "browser-console.log"), logs.join("\n"));
  socket.close();
  browser.kill();
  server.close();
  server.closeAllConnections();
  await new Promise((resolve) => setTimeout(resolve, 500));
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
