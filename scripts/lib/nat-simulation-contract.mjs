import assert from "node:assert/strict";
import path from "node:path";

export const APPLICATION_SHA = "62cbe7aa20390ddd87ece97c41b1424b8c9154a4";
export const BASE_URL = "https://127.0.0.1:5443";

export function assertCiIsolation(env) {
  for (const [key, expected] of Object.entries({
    CI: "true", GITHUB_ACTIONS: "true", NAT_SIMULATION_ISOLATED: "1",
    PG_HOST: "127.0.0.1", PG_PORT: "5432", PG_USER: "postgres",
    PG_DATABASE: "sqr_nat_simulation", NAT_SIMULATION_EXPECTED_SHA: APPLICATION_SHA,
  })) assert.equal(env[key], expected, `Isolated CI requires ${key}=${expected}`);
  assert.ok(env.PG_PASSWORD?.length >= 32, "Ephemeral PostgreSQL password is required");
  for (const key of ["DATABASE_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGOPTIONS", "REDIS_URL", "SQR_REDIS_RATE_LIMIT_URL", "SQR_REDIS_WS_URL", "SQR_REDIS_QUEUE_URL", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS"]) {
    assert.ok(!env[key], `Refusing inherited ${key}; CI orchestration owns service configuration`);
  }
  assert.ok(path.isAbsolute(env.GITHUB_WORKSPACE || ""), "GITHUB_WORKSPACE must be absolute");
  assert.ok(path.isAbsolute(env.RUNNER_TEMP || ""), "RUNNER_TEMP must be absolute");
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted", "Only disposable GitHub-hosted runners are allowed");
}

export function summarizeEdgeLog(raw) {
  const rows = raw.trim() ? raw.trim().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  const sources = new Set();
  const routes = new Map();
  let edge429 = 0;
  let upstream429 = 0;
  let serverErrors = 0;
  for (const row of rows) {
    sources.add(row.source);
    if (row.status === 429 && !String(row.upstreamStatus || "").includes("429")) edge429++;
    if (String(row.upstreamStatus || "").includes("429")) upstream429++;
    if (row.status >= 500) serverErrors++;
    const route = `${row.method} ${row.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")}`;
    const value = routes.get(route) || { route, count: 0, statuses: {}, latencyMs: [] };
    value.count++;
    value.statuses[row.status] = (value.statuses[row.status] || 0) + 1;
    // A WebSocket access-log duration is connection lifetime, not HTTP latency.
    if (row.status !== 101) value.latencyMs.push(Number(row.seconds) * 1000);
    routes.set(route, value);
  }
  return {
    requests: rows.length, sourceIpCount: sources.size,
    allSourcesLoopback: sources.size === 1 && sources.has("127.0.0.1"),
    edge429, upstream429, serverErrors,
    routes: [...routes.values()].map(({ latencyMs, ...value }) => {
      latencyMs.sort((a, b) => a - b);
      return { ...value, p95Ms: latencyMs.length ? latencyMs[Math.ceil(latencyMs.length * 0.95) - 1] : null };
    }).sort((a, b) => a.route.localeCompare(b.route)),
  };
}

export function startupDiagnosticMessages(raw, secrets = []) {
  const messages = [];
  for (const line of raw.split(/\r?\n/)) {
    let message;
    try {
      const row = JSON.parse(line);
      if (!["error", "fatal", 50, 60].includes(row.level)) continue;
      message = [row.msg, row.error?.name, row.error?.code, row.error?.message].filter((value) => typeof value === "string").join(" | ");
    } catch {
      if (/^(?:Error|TypeError|AssertionError|nginx: \[emerg\]):?/.test(line)) message = line;
    }
    if (!message) continue;
    for (const value of secrets) if (value) message = message.replaceAll(value, "[redacted]");
    message = message.replace(/(?:https?|rediss?|postgres(?:ql)?):\/\/\S+/gi, "[redacted-url]")
      .replace(/\b(?:password|token|secret|authorization|cookie)\s*[=:]\s*\S+/gi, "[redacted-credential]")
      .replace(/[A-Za-z0-9_+/=-]{40,}/g, "[redacted-value]").slice(0, 600);
    messages.push(message);
  }
  return messages.slice(-15);
}

// These are the verified active production admission values from 2026-09-10,
// not the larger capacity examples in deploy/nginx/sqr.conf.example.
export function nginxConfiguration() {
  const proxy = (timeout = 300) => `proxy_pass http://127.0.0.1:5000;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header X-Forwarded-Proto https;
      proxy_read_timeout ${timeout}s;
      proxy_send_timeout ${timeout}s;`;
  const location = (selector, zone, burst, connections, extra = "", timeout = 300) => `
    location ${selector} {
      limit_req zone=sqr_${zone}_per_ip burst=${burst} nodelay;
      limit_conn sqr_${zone}_conn ${connections};
      ${proxy(timeout)}
      ${extra}
    }`;
  return `worker_processes 1;
daemon off;
pid nginx.pid;
error_log nginx-error.log warn;
events { worker_connections 2048; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  client_body_temp_path client-body;
  proxy_temp_path proxy-temp;
  fastcgi_temp_path fastcgi-temp;
  uwsgi_temp_path uwsgi-temp;
  scgi_temp_path scgi-temp;
  map $http_upgrade $connection_upgrade { default upgrade; "" close; }
  limit_req_zone $binary_remote_addr zone=sqr_api_per_ip:10m rate=100r/s;
  limit_req_zone $binary_remote_addr zone=sqr_auth_per_ip:10m rate=5r/s;
  limit_req_zone $binary_remote_addr zone=sqr_ws_per_ip:10m rate=10r/s;
  limit_req_zone $binary_remote_addr zone=sqr_telemetry_per_ip:10m rate=5r/s;
  limit_req_zone $binary_remote_addr zone=sqr_import_per_ip:10m rate=10r/m;
  ${["api", "auth", "ws", "telemetry", "import"].map((zone) => `limit_conn_zone $binary_remote_addr zone=sqr_${zone}_conn:10m;`).join("\n  ")}
  log_format nat escape=json '{"source":"$remote_addr","method":"$request_method","path":"$uri","status":$status,"upstreamStatus":"$upstream_status","edgeRate":"$limit_req_status","edgeConnection":"$limit_conn_status","seconds":$request_time}';
  access_log nginx-access.jsonl nat;
  server {
    listen 127.0.0.1:5443 ssl;
    server_name 127.0.0.1;
    ssl_certificate server.crt;
    ssl_certificate_key server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    limit_req_status 429;
    limit_conn_status 429;
    client_max_body_size 100M;
    proxy_buffer_size 32k;
    proxy_buffers 8 32k;
    proxy_busy_buffers_size 64k;
    ${location("= /api/login", "auth", 100, 40, "", 30)}
    ${location("= /api/auth/login", "auth", 100, 40, "", 30)}
    ${location("/ws", "ws", 100, 200, "proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; proxy_buffering off;")}
    ${location("= /api/telemetry/client-errors", "telemetry", 100, 20, "", 30)}
    ${location("= /api/telemetry/web-vitals", "telemetry", 100, 20, "", 30)}
    ${location("= /telemetry/web-vitals", "telemetry", 100, 20, "", 30)}
    ${location("= /api/imports", "import", 5, 3, "proxy_request_buffering off;", 360)}
    ${location("/api/", "api", 300, 240)}
    location / { ${proxy()} }
  }
}
`;
}
