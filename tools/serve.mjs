import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const types = { ".html": "text/html", ".js": "text/javascript", ".unturned": "application/octet-stream" };

export function serve(root, port) {
  const server = createServer((request, response) => {
    const name = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
    const file = join(root, normalize(name));
    let size;
    try {
      size = statSync(file).size;
    } catch {
      response.writeHead(404).end();
      return;
    }

    const headers = { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Accept-Ranges": "bytes" };
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end) {
        response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        return;
      }
      response.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
      createReadStream(file, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, { ...headers, "Content-Length": size });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] === import.meta.filename) {
  const [root, port] = process.argv.slice(2);
  await serve(root, Number(port));
  console.log(`http://localhost:${port}/`);
}
