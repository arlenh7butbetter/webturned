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
const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=1280,720", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

let page;
for (let i = 0; i < 100 && !page; i++) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const portFile = join(profile, "DevToolsActivePort");
  const port = existsSync(portFile) ? readFileSync(portFile, "utf8").split("\n")[0].trim() : "";
  if (port) page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((target) => target.type === "page");
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
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/index.html` });
const clicks = (clickSpec ?? "").split(";").filter(Boolean).map((spec) => {
  const [action, at] = spec.split("@");
  if (action.startsWith("js:")) return { expression: action.slice(3), at: Number(at) };
  if (action.startsWith("key:")) {
    const [, code, key, virtualCode, hold] = action.split(":");
    return { keyPress: { code, key, windowsVirtualKeyCode: Number(virtualCode) }, hold: Number(hold), at: Number(at) };
  }
  const [x, y] = action.split(",").map(Number);
  return { x, y, at: Number(at) };
});

async function click({ x, y, keyPress, hold, expression }, index) {
  if (expression) {
    await send("Runtime.evaluate", { expression });
    logs.push(`[probe] evaluated ${expression}`);
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
