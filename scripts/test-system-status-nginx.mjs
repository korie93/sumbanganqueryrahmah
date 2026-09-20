import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

// This runner never imports application bootstrap/.env, contacts production,
// changes an installed Nginx service, or stops an unrelated process.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const portable = path.join(root, "artifacts/system-status-nginx-tools/nginx-1.24.0/nginx.exe");
const binary = process.env.SQR_NGINX_EXECUTABLE || (process.platform === "win32" && existsSync(portable) ? portable : "nginx");
const outputParent = path.join(root, "artifacts/system-status-nginx");
await mkdir(outputParent, { recursive: true });
const runtime = await mkdtemp(path.join(outputParent, "run-"));
await mkdir(path.join(runtime, "logs"));
await mkdir(path.join(runtime, "temp"));
const unix = (value) => value.replaceAll("\\", "/");
const prefix = `${unix(runtime)}/`;
const checks = [];
let nginx;
let nginxExit;
let fixture;
let websocketServer;
const fixtureSockets = new Set();

function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: runtime, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(output) : reject(new Error(`Nginx command exited ${code}: ${output}`)));
  });
}

async function freePort() {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  return port;
}

function fixturePayload(status) {
  return { ok: false, code: "FIXTURE_ERROR", message: `Synthetic API ${status}`, error: { code: "FIXTURE_ERROR", message: `Synthetic API ${status}`, details: { preserved: true } } };
}

async function startFixture(port = 0) {
  fixture = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname.endsWith("/slow")) return; // actual upstream header timeout
    if (url.pathname === "/api/health/live") {
      res.setHeader("Content-Type", "application/json");
      res.end('{"status":"ok","ready":true}');
      return;
    }
    if (url.pathname === "/socket.io/") {
      res.setHeader("Content-Type", "text/plain");
      res.end('0{"sid":"synthetic-session","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}');
      return;
    }
    const status = Number(url.searchParams.get("status")) || Number(url.pathname.match(/^\/api\/status\/(\d+)$/)?.[1]);
    if (status) {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Synthetic-Upstream", "preserved");
      if (status === 429) res.setHeader("Retry-After", "17");
      res.end(JSON.stringify(fixturePayload(status)));
      return;
    }
    if (url.pathname === "/maintenance") {
      res.statusCode = 503;
      res.setHeader("X-SQR-Maintenance", "1");
      res.end("Synthetic upstream maintenance");
      return;
    }
    const upstreamCode = Number(url.pathname.match(/^\/upstream-(502|503|504)$/)?.[1]);
    if (upstreamCode) {
      res.statusCode = upstreamCode;
      res.end("Synthetic upstream infrastructure error");
      return;
    }
    res.statusCode = url.pathname === "/unknown-route" ? 404 : 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Security-Policy", "default-src 'self'");
    res.end(`<html><body>Synthetic application ${res.statusCode}</body></html>`);
  });
  fixture.on("connection", (socket) => {
    fixtureSockets.add(socket);
    socket.once("close", () => fixtureSockets.delete(socket));
  });
  websocketServer = new WebSocketServer({ server: fixture, path: "/ws" });
  websocketServer.on("connection", (socket) => socket.on("message", (message) => socket.send(message)));
  fixture.listen(port, "127.0.0.1");
  await once(fixture, "listening");
  return fixture.address().port;
}

async function stopFixture() {
  if (!fixture) return;
  for (const client of websocketServer.clients) client.terminate();
  websocketServer.close();
  for (const socket of fixtureSockets) socket.destroy();
  await new Promise((resolve) => fixture.close(resolve));
  fixture = undefined;
}

let base;
async function request(route, options = {}) {
  const response = await fetch(`${base}${route}`, { redirect: "manual", signal: AbortSignal.timeout(10000), ...options });
  const body = await response.text();
  assert.doesNotMatch(response.headers.get("server") || "", /nginx\//i, "Nginx version must not leak");
  return { response, body };
}
const documentHeaders = { Accept: "text/html", "Sec-Fetch-Dest": "document" };
async function assertHtml(route, status, pageName, method = "GET", extraHeaders = {}) {
  const { response, body } = await request(route, { method, headers: { ...documentHeaders, ...extraHeaders } });
  assert.equal(response.status, status, route);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(response.headers.get("retry-after"), null, "Do not invent an ETA");
  assert.equal(response.headers.get("location"), null, "Do not redirect error responses to 200");
  assert.doesNotMatch(body, /nginx\/?|127\.0\.0\.1|PM2|Synthetic upstream/i);
  if (method === "HEAD") assert.equal(body, "");
  else assert.equal(body, await readFile(path.join(root, `deploy/errors/${pageName}.html`), "utf8"));
  checks.push({ route, method, status, format: "html", page: pageName });
}
async function assertEdgeJson(route, status, options = {}) {
  const { response, body } = await request(route, options);
  assert.equal(response.status, status, route);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  if (options.method === "HEAD") assert.equal(body, "");
  else {
    const payload = JSON.parse(body);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, status === 504 ? "REQUEST_TIMEOUT" : "SERVICE_UNAVAILABLE");
    assert.equal(payload.error.code, payload.code);
    assert.doesNotMatch(body, /<html|nginx|127\.0\.0\.1|PM2|Synthetic upstream/i);
  }
  checks.push({ route, method: options.method || "GET", status, format: "json" });
}

try {
  for (const asset of ["502.html", "503.html", "504.html", "maintenance.html", "assets/status.css", "assets/status.js", "assets/sqr-logo.svg"]) {
    assert.ok(existsSync(path.join(root, "deploy/errors", asset)), `Generate static error asset first: ${asset}`);
  }
  const appPort = await startFixture();
  const proxyPort = await freePort();
  base = `http://127.0.0.1:${proxyPort}`;
  const httpSnippet = await readFile(path.join(root, "deploy/nginx/sqr-error-pages-http.conf.example"), "utf8");
  const headersSnippet = await readFile(path.join(root, "deploy/nginx/sqr-error-pages-response-headers.conf.example"), "utf8");
  const headersPath = path.join(runtime, "response-headers.conf");
  await writeFile(headersPath, headersSnippet);
  const serverSnippet = (await readFile(path.join(root, "deploy/nginx/sqr-error-pages-server.conf.example"), "utf8"))
    .replaceAll("/var/www/sqr-errors", unix(path.join(root, "deploy/errors")))
    .replaceAll("/etc/nginx/snippets/sqr-error-pages-response-headers.conf", `"${unix(headersPath)}"`);
  const proxy = `proxy_pass http://127.0.0.1:${appPort}; proxy_http_version 1.1;
      proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto http;
      proxy_read_timeout 1s; proxy_send_timeout 1s; proxy_connect_timeout 5s;`;
  const passThrough = ["/api/", "= /api/login", "= /api/auth/login", "= /api/imports", "= /api/telemetry/client-errors", "= /telemetry/web-vitals", "/socket.io/", "/assets/"]
    .map((selector) => `location ${selector} { ${proxy} }`).join("\n");
  const config = `worker_processes 1; pid nginx.pid; error_log logs/error.log warn;
events { worker_connections 128; }
http {
  default_type application/octet-stream;
  access_log off;
  ${httpSnippet}
  map $http_upgrade $connection_upgrade { default upgrade; "" close; }
  server { listen 127.0.0.1:${proxyPort}; server_name localhost; server_tokens off;
    ${serverSnippet}
    ${passThrough}
    location /ws { ${proxy} proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; proxy_buffering off; }
    location / { ${proxy} }
    # Test-only local edge failures. None of these routes exists in the shipped site.
    location = /edge-502 { return 502; }
    location = /edge-503 { return 503; }
    location = /edge-504 { return 504; }
    location = /edge-maintenance { error_page 503 /_sqr/errors/maintenance.html; return 503; }
  }
}`;
  await writeFile(path.join(runtime, "nginx.conf"), config);
  const syntax = await command(["-t", "-p", prefix, "-c", "nginx.conf"]);
  await writeFile(path.join(runtime, "nginx-test.txt"), syntax);
  const version = (await command(["-v"])).trim();
  nginx = spawn(binary, ["-p", prefix, "-c", "nginx.conf", "-g", "daemon off;"], { cwd: runtime, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let nginxLog = "";
  nginx.stdout.on("data", (chunk) => { nginxLog += chunk; });
  nginx.stderr.on("data", (chunk) => { nginxLog += chunk; });
  nginxExit = new Promise((resolve, reject) => { nginx.once("error", reject); nginx.once("close", resolve); });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (nginx.exitCode !== null) throw new Error(`Isolated Nginx exited before readiness: ${nginxLog}`);
    try { ready = (await request("/api/health/live")).response.status === 200; } catch { /* process startup */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Nginx did not start: ${nginxLog}`);

  for (const route of ["/", "/general-search", "/collection-daily", "/billing-principal", "/reset-password"]) {
    const { response, body } = await request(route, { headers: documentHeaders });
    assert.equal(response.status, 200);
    assert.match(body, /Synthetic application 200/);
    assert.equal(response.headers.get("content-security-policy"), "default-src 'self'", "App headers remain app-owned");
    checks.push({ route, status: 200, format: "unchanged app document" });
  }
  const notFound = await request("/unknown-route", { headers: documentHeaders });
  assert.equal(notFound.response.status, 404);
  assert.match(notFound.body, /Synthetic application 404/);
  checks.push({ route: "/unknown-route", status: 404, format: "unchanged app document" });
  const apiSlash = await request("/api");
  assert.equal(apiSlash.response.status, 301, "Preserve the existing prefix-location slash redirect");
  assert.ok(apiSlash.response.headers.get("location").endsWith("/api/"));
  checks.push({ route: "/api", status: 301, format: "unchanged prefix redirect" });

  for (const route of ["/api/status", "/api/login", "/api/auth/login", "/api/imports", "/api/telemetry/client-errors", "/telemetry/web-vitals", "/socket.io/status"]) {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 502, 503, 504]) {
      const { response, body } = await request(`${route}?status=${status}`, { headers: documentHeaders });
      assert.equal(response.status, status);
      assert.match(response.headers.get("content-type"), /^application\/json/);
      assert.equal(response.headers.get("x-synthetic-upstream"), "preserved");
      assert.deepEqual(JSON.parse(body), fixturePayload(status));
      if (status === 429) assert.equal(response.headers.get("retry-after"), "17");
      checks.push({ route, status, format: "unchanged upstream json" });
    }
  }
  for (const status of [502, 503, 504]) {
    await assertHtml(`/edge-${status}`, status, String(status));
    await assertHtml(`/edge-${status}`, status, String(status), "HEAD");
    const upstream = await request(`/upstream-${status}`, { headers: documentHeaders });
    assert.equal(upstream.response.status, status);
    assert.equal(upstream.body, "Synthetic upstream infrastructure error", "Never replace an upstream-owned response body");
    checks.push({ route: `/upstream-${status}`, status, format: "unchanged upstream response" });
  }
  await assertHtml("/edge-maintenance", 503, "maintenance");
  await assertHtml("/edge-503", 503, "503", "GET", { "X-SQR-Maintenance": "1" });
  const maintenance = await request("/maintenance", { headers: documentHeaders });
  assert.equal(maintenance.response.status, 503);
  assert.equal(maintenance.response.headers.get("x-sqr-maintenance"), "1");
  assert.equal(maintenance.body, "Synthetic upstream maintenance");
  checks.push({ route: "/maintenance", status: 503, format: "unchanged upstream maintenance" });
  await assertHtml("/slow", 504, "504");
  await assertEdgeJson("/api/slow", 504, { headers: documentHeaders });
  await assertEdgeJson("/edge-503", 503, { headers: { Accept: "application/json" } });
  await assertEdgeJson("/edge-503", 503, { method: "POST", headers: documentHeaders });
  await assertEdgeJson("/edge-503", 503, { headers: { ...documentHeaders, "Sec-Fetch-Dest": "script" } });

  const ws = new WebSocket(`ws://127.0.0.1:${proxyPort}/ws`, { handshakeTimeout: 5000 });
  await once(ws, "open");
  const echo = once(ws, "message");
  ws.send("synthetic-realtime-echo");
  assert.equal(String((await echo)[0]), "synthetic-realtime-echo");
  ws.close();
  await once(ws, "close");
  checks.push({ route: "/ws", status: 101, format: "websocket echo" });
  const polling = await request("/socket.io/?EIO=4&transport=polling");
  assert.equal(polling.response.status, 200);
  assert.match(polling.body, /^0\{"sid":"synthetic-session"/);
  checks.push({ route: "/socket.io/", status: 200, format: "long-poll transport passthrough" });

  await stopFixture(); // truly unavailable Node upstream, not a mocked browser response
  await assertHtml("/general-search", 502, "502");
  await assertHtml("/general-search", 502, "502", "HEAD");
  for (const route of ["/api/status", "/API/status", "/api/login", "/api/auth/login", "/api/imports", "/api/telemetry/client-errors", "/telemetry/web-vitals", "/ws", "/socket.io/?transport=polling", "/assets/app.js", "/internal/health", "/uploads/private.pdf"]) {
    await assertEdgeJson(route, 502, { headers: documentHeaders });
  }
  for (const [asset, contentType] of [["status.css", "text/css"], ["status.js", "application/javascript"], ["sqr-logo.svg", "image/svg+xml"]]) {
    const { response, body } = await request(`/_sqr/errors/assets/${asset}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type").startsWith(contentType));
    assert.equal(body, await readFile(path.join(root, "deploy/errors/assets", asset), "utf8"));
    assert.equal(response.headers.get("cache-control"), "no-store");
    checks.push({ route: `/_sqr/errors/assets/${asset}`, status: 200, format: "static without Node" });
  }
  const unexpected = await request("/_sqr/errors/assets/not-allowlisted.txt");
  assert.equal(unexpected.response.status, 404);
  assert.equal(JSON.parse(unexpected.body).code, "NOT_FOUND");
  await startFixture(appPort);
  const recovery = await request("/api/health/live");
  assert.deepEqual(JSON.parse(recovery.body), { status: "ok", ready: true });
  checks.push({ route: "/api/health/live", status: 200, format: "upstream recovered without Nginx restart" });
  await writeFile(path.join(runtime, "result.json"), `${JSON.stringify({ status: "passed", version, scope: "isolated loopback proxy and synthetic upstream; not live production", syntax: "passed", checks }, null, 2)}\n`);
  console.log(`[system-status-nginx] ${checks.length} checks passed; ${version}; artifacts: ${path.relative(root, runtime)}`);
} finally {
  await stopFixture();
  if (nginx && nginx.exitCode === null) {
    await command(["-s", "quit", "-p", prefix, "-c", "nginx.conf"]);
    await Promise.race([nginxExit, new Promise((_, reject) => setTimeout(() => reject(new Error("Isolated Nginx did not stop after scoped quit")), 7000))]);
  }
}
