import { randomInt, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const rooms = new Map();

function send(stream, message) {
  stream.write(`data: ${JSON.stringify(message)}\n\n`);
}

function openRoom(stream) {
  let code;
  do code = String(randomInt(100000, 1000000));
  while (rooms.has(code));
  const room = { host: stream, token: randomUUID(), peers: new Map() };
  rooms.set(code, room);
  send(stream, { type: "room", room: code, token: room.token });
  stream.on("close", () => {
    rooms.delete(code);
    for (const peer of room.peers.values()) peer.end();
  });
}

function joinRoom(stream, code) {
  const room = rooms.get(code);
  if (!room) {
    send(stream, { type: "missing" });
    stream.end();
    return;
  }
  const peer = randomUUID();
  room.peers.set(peer, stream);
  send(stream, { type: "welcome", peer });
  send(room.host, { type: "join", peer });
  stream.on("close", () => {
    room.peers.delete(peer);
    if (rooms.get(code) === room) send(room.host, { type: "leave", peer });
  });
}

async function relay(request, response) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65536) {
      response.writeHead(413).end();
      return;
    }
  }
  const { room: code, from, token, to, data } = JSON.parse(body);
  const room = rooms.get(code);
  const target = to === "host" ? room?.host : room?.peers.get(to);
  if (!target || (from === "host" ? token !== room.token : !room.peers.has(from))) {
    response.writeHead(404).end();
    return;
  }
  send(target, { type: "signal", from, data });
  response.writeHead(204).end();
}

createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  const url = new URL(request.url, "http://localhost");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
  } else if (request.method === "GET" && url.pathname === "/events") {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const keepAlive = setInterval(() => response.write(": ping\n\n"), 25000);
    response.on("close", () => clearInterval(keepAlive));
    const code = url.searchParams.get("room");
    if (code) joinRoom(response, code);
    else openRoom(response);
  } else if (request.method === "POST" && url.pathname === "/send") {
    relay(request, response).catch(() => response.writeHead(400).end());
  } else {
    response.writeHead(404).end();
  }
}).listen(port, () => console.log(`Signaling on port ${port}`));
