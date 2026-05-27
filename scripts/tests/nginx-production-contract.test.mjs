import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const nginxConfigPath = path.join(repoRoot, "deploy", "nginx", "sqr.conf.example");
const envExamplePath = path.join(repoRoot, ".env.example");
const productionEnvTemplatePath = path.join(repoRoot, "deploy", "examples", "sqr.production.env.template");
const hetznerDocPath = path.join(repoRoot, "docs", "HETZNER_PRODUCTION_DEPLOYMENT.md");

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function activeLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function parseSizeBytes(rawValue) {
  const normalized = String(rawValue || "").trim().replace(/;$/, "");
  const match = normalized.match(/^(\d+)(b|k|kb|m|mb|g|gb)?$/i);
  if (!match) {
    throw new Error(`Unsupported size value: ${rawValue}`);
  }

  const value = Number(match[1]);
  const unit = (match[2] || "b").toLowerCase();
  const multiplier = unit === "g" || unit === "gb"
    ? 1024 ** 3
    : unit === "m" || unit === "mb"
      ? 1024 ** 2
      : unit === "k" || unit === "kb"
        ? 1024
        : 1;
  return value * multiplier;
}

function readEnvValue(text, name) {
  const match = text.match(new RegExp(`^${name}=(.+)$`, "m"));
  if (!match) {
    throw new Error(`Missing ${name} in .env.example`);
  }
  return match[1].trim();
}

function readAnyEnvValue(text, name, sourceName = "environment template") {
  const match = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match) {
    throw new Error(`Missing ${name} in ${sourceName}`);
  }
  return match[1].trim();
}

function readNginxDirectiveValue(lines, directive) {
  const line = lines.find((entry) => entry.startsWith(`${directive} `));
  if (!line) {
    throw new Error(`Missing ${directive} in Nginx example`);
  }
  return line.slice(directive.length).trim();
}

function extractLocationBlock(text, location) {
  const startPattern = `location ${location} {`;
  const startIndex = text.indexOf(startPattern);
  if (startIndex === -1) {
    throw new Error(`Missing Nginx location ${location}`);
  }

  const bodyStart = text.indexOf("{", startIndex);
  let depth = 0;
  for (let index = bodyStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error(`Unclosed Nginx location ${location}`);
}

function assertLoginLocationUsesAuthThrottle(text, location) {
  const block = extractLocationBlock(text, location);

  assert.match(block, /limit_req zone=sqr_auth_per_ip burst=5 nodelay;/);
  assert.match(block, /limit_conn sqr_conn_per_ip 10;/);
  assert.match(block, /proxy_pass http:\/\/127\.0\.0\.1:5000;/);
}

test("production Nginx import body limit stays aligned with Express import limit", () => {
  const nginxText = readText(nginxConfigPath);
  const envText = readText(envExamplePath);
  const lines = activeLines(nginxText);

  const nginxBodyLimit = parseSizeBytes(readNginxDirectiveValue(lines, "client_max_body_size"));
  const expressImportLimit = parseSizeBytes(readEnvValue(envText, "IMPORT_BODY_LIMIT"));

  assert.ok(
    nginxBodyLimit >= expressImportLimit,
    "client_max_body_size must be >= IMPORT_BODY_LIMIT so Express can return app-level import errors",
  );
  assert.match(nginxText, /Express can return\s+# application-level import validation errors/i);
});

test("production Nginx example does not emit conflicting Helmet-owned headers", () => {
  const nginxText = readText(nginxConfigPath);
  const lines = activeLines(nginxText);
  const conflictingHeaders = lines.filter((line) =>
    /^add_header\s+(Strict-Transport-Security|X-Frame-Options)\b/i.test(line),
  );

  assert.deepEqual(conflictingHeaders, []);
  assert.match(nginxText, /Browser security headers are owned by the Express\/Helmet app layer/);
  assert.match(nginxText, /X-Frame-Options at\s+# SAMEORIGIN/i);
  assert.match(nginxText, /HSTS preload off/i);
  assert.match(nginxText, /HSTS_MAX_AGE_SECONDS=31536000/i);
  assert.match(nginxText, /https:\/\/hstspreload\.org/i);
});

test("production Nginx example gives web-vitals telemetry its own bounded edge throttle", () => {
  const nginxText = readText(nginxConfigPath);

  assert.match(nginxText, /zone=sqr_telemetry_per_ip:10m rate=60r\/m/);
  assert.match(nginxText, /location = \/telemetry\/web-vitals/);
  assert.match(nginxText, /limit_req zone=sqr_telemetry_per_ip burst=20 nodelay/);
  assert.match(nginxText, /Do not send personal data, auth tokens, cookies, or session identifiers/);
});

test("production environment templates keep upload scanning and runtime topology fail-safe", () => {
  const envText = readText(envExamplePath);
  const productionEnvText = readText(productionEnvTemplatePath);
  const docText = readText(hetznerDocPath);

  for (const [sourceName, text] of [
    [".env.example", envText],
    ["deploy/examples/sqr.production.env.template", productionEnvText],
  ]) {
    assert.equal(readAnyEnvValue(text, "COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED", sourceName), "1");
    assert.equal(readAnyEnvValue(text, "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND", sourceName), "clamdscan");
    assert.match(readAnyEnvValue(text, "COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON", sourceName), /--fdpass/);
    assert.equal(readAnyEnvValue(text, "COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED", sourceName), "1");
    assert.equal(readAnyEnvValue(text, "PG_MAX_CONNECTIONS", sourceName), "10");
    assert.equal(readAnyEnvValue(text, "SQR_MAX_WORKERS", sourceName), "1");
    assert.equal(readAnyEnvValue(text, "SQR_WS_MAX_CONNECTIONS", sourceName), "1000");
    assert.equal(readAnyEnvValue(text, "SQR_WS_MAX_MESSAGE_BYTES", sourceName), "1048576");
  }

  assert.equal(readAnyEnvValue(envText, "HSTS_MAX_AGE_SECONDS", ".env.example"), "31536000");
  assert.equal(
    readAnyEnvValue(productionEnvText, "HSTS_MAX_AGE_SECONDS", "deploy/examples/sqr.production.env.template"),
    "31536000",
  );
  assert.equal(
    readAnyEnvValue(productionEnvText, "HSTS_PRELOAD_ENABLED", "deploy/examples/sqr.production.env.template"),
    "0",
  );
  assert.equal(
    readAnyEnvValue(productionEnvText, "SQR_RATE_LIMIT_STORE", "deploy/examples/sqr.production.env.template"),
    "redis",
  );
  assert.match(
    readAnyEnvValue(productionEnvText, "SQR_REDIS_RATE_LIMIT_URL", "deploy/examples/sqr.production.env.template"),
    /^rediss?:\/\//,
  );
  assert.match(docText, /clamdscan --fdpass/i);
  assert.match(docText, /Redis pub\/sub WebSocket/i);
});

test("production Nginx example bounds WebSocket proxy timeouts for runtime sockets", () => {
  const nginxText = readText(nginxConfigPath);
  const docText = readText(hetznerDocPath);

  for (const sourceText of [nginxText, docText]) {
    const block = extractLocationBlock(sourceText, "/ws");
    assert.match(block, /proxy_buffering off;/);
    assert.match(block, /proxy_read_timeout 300s;/);
    assert.match(block, /proxy_send_timeout 300s;/);
  }
});

test("production Nginx example applies auth edge throttle to both login routes", () => {
  const nginxText = readText(nginxConfigPath);

  assertLoginLocationUsesAuthThrottle(nginxText, "= /api/login");
  assertLoginLocationUsesAuthThrottle(nginxText, "= /api/auth/login");
  assert.match(nginxText, /legacy \/api\/login path/);
});

test("production Nginx example buffers app security headers and auth cookies", () => {
  const nginxText = readText(nginxConfigPath);
  const lines = activeLines(nginxText);

  assert.ok(parseSizeBytes(readNginxDirectiveValue(lines, "proxy_buffer_size")) >= 32 * 1024);
  assert.match(nginxText, /proxy_buffers 8 32k;/);
  assert.match(nginxText, /proxy_busy_buffers_size 64k;/);
  assert.match(nginxText, /upstream sent too big header/);
});

test("Hetzner deployment guide mirrors the hardened Nginx contract", () => {
  const docText = readText(hetznerDocPath);
  const lines = activeLines(docText);
  const conflictingHeaders = lines.filter((line) =>
    /^add_header\s+(Strict-Transport-Security|X-Frame-Options)\b/i.test(line),
  );

  assert.deepEqual(conflictingHeaders, []);
  assert.match(docText, /client_max_body_size 100M;/);
  assert.match(docText, /proxy_buffer_size 32k;/);
  assert.match(docText, /proxy_buffers 8 32k;/);
  assert.match(docText, /proxy_busy_buffers_size 64k;/);
  assert.match(docText, /upstream sent too big header/);
  assert.match(docText, /zone=sqr_telemetry_per_ip:10m rate=60r\/m/);
  assert.match(docText, /location = \/telemetry\/web-vitals/);
  assertLoginLocationUsesAuthThrottle(docText, "= /api/login");
  assertLoginLocationUsesAuthThrottle(docText, "= /api/auth/login");
  assert.match(docText, /legacy \/api\/login path/);
  assert.match(docText, /Browser security headers kekal diurus oleh Express\/Helmet/);
  assert.match(docText, /HSTS_MAX_AGE_SECONDS=31536000/i);
  assert.match(docText, /https:\/\/hstspreload\.org/i);
});
