import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
};

/** Read-only loopback server for the real built public app; never starts a backend or loads .env. */
export async function startPasswordPublicBuildServer(publicDirectory) {
  const root = await realpath(publicDirectory);
  await stat(path.join(root, "index.html"));
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://fixture.invalid").pathname);
      const relative = ["/", "/reset-password", "/activate-account", "/login"].includes(pathname)
        ? "index.html" : pathname.slice(1);
      const candidate = path.resolve(root, relative);
      if (!candidate.startsWith(`${root}${path.sep}`) || pathname.includes("\\") || pathname.includes("\0")) {
        response.writeHead(404).end();
        return;
      }
      const resolved = await realpath(candidate);
      if (!resolved.startsWith(`${root}${path.sep}`) || !(await stat(resolved)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const type = contentTypes[path.extname(resolved)];
      if (!type) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader("Content-Type", type);
      response.writeHead(200).end(request.method === "HEAD" ? undefined : await readFile(resolved));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
