import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startSingleActiveTabFixture } from "./single-active-tab-fixture.mjs";

// Local-only synthetic preview of the actual built application. No backend,
// dotenv, database, credentials or application test bypass is involved.
export async function startGeneralSearchEmptyFixture({ port = 0 } = {}) {
  assert.ok(Number.isSafeInteger(port) && port >= 0 && port <= 65535);
  const fixture = await startSingleActiveTabFixture();
  fixture.state.user.id = "enterprise-empty-synthetic-account";
  const canonical = new URL("../../docs/design/general-search-enterprise-final/", import.meta.url);
  const markup = readFileSync(new URL("empty-state.html", canonical), "utf8");
  const css = readFileSync(new URL("empty-state.css", canonical), "utf8");
  const securitySource = readFileSync(new URL("../../server/internal/local-http-security.ts", import.meta.url), "utf8");
  const styleHashes = [...securitySource.matchAll(/"('sha256-[A-Za-z0-9+/=]+')"/g)].map((match) => match[1]);
  assert.ok(styleHashes.length > 0, "Keep Radix's approved production style hashes in this strict CSP fixture");
  const csp = ["default-src 'self'", "base-uri 'self'", "connect-src 'self'", "img-src 'self' data: blob:",
    "font-src 'self'", "script-src 'self'", "script-src-attr 'none'", "style-src 'self'",
    `style-src-elem 'self' ${styleHashes.join(" ")}`, "style-src-attr 'none'", "object-src 'none'",
    "frame-src 'self' blob:", "trusted-types default sqr-ui dompurify", "require-trusted-types-for 'script'"].join("; ");
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://fixture.invalid");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD", "POST"].includes(request.method)) return void response.writeHead(405).end();
    if (url.pathname === "/__reference.css") {
      response.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      return void response.end(css);
    }
    if (url.pathname === "/__reference") {
      const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
      // Only bounded numeric width is interpolated; the source and query are fixed.
      const width = Math.min(1600, Math.max(240, Number(url.searchParams.get("width")) || 1000));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return void response.end(`<!doctype html><html lang="ms" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Supplied FINAL reference</title><link rel="stylesheet" href="/__reference.css"><style>body{margin:0;padding:0;background:${theme === "dark" ? "#0e1419" : "#f2f6f8"}}.sqr-empty{width:${width}px;max-width:100%}</style></head><body>${markup}</body></html>`);
    }
    if (["/api/search/global", "/api/search/advanced"].includes(url.pathname)) {
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const pageSize = Math.max(10, Number(url.searchParams.get("pageSize")) || 50);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return void response.end(JSON.stringify({ columns: ["Customer Name", "Account No", "Card No"],
        rows: [], results: [], total: 0, totalIsApproximate: false,
        page, pageSize, limit: pageSize, offset: (page - 1) * pageSize,
        pagination: { mode: "offset", page, pageSize, limit: pageSize, offset: (page - 1) * pageSize,
          total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: page > 1 } }));
    }
    const upstream = httpRequest(new URL(`${url.pathname}${url.search}`, fixture.origin), { method: request.method,
      headers: { "content-type": request.headers["content-type"] || "application/json" } }, (incoming) => {
      response.writeHead(incoming.statusCode, { ...incoming.headers, "Content-Security-Policy": csp });
      incoming.pipe(response);
    });
    upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.on("aborted", () => upstream.destroy());
    request.pipe(upstream);
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  } catch (error) { await fixture.close(); throw error; }
  return { origin: `http://127.0.0.1:${server.address().port}`, state: fixture.state,
    async close() {
      await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
      await fixture.close();
    } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.ok(process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === "--port" && /^\d{1,5}$/.test(process.argv[3])));
  const fixture = await startGeneralSearchEmptyFixture({ port: Number(process.argv[3] || 0) });
  process.stdout.write(`Synthetic General Search preview: ${fixture.origin}/general-search\n`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => void fixture.close().then(() => process.exit(0)));
}
