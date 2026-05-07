import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const nginxConfigPath = path.join(repoRoot, "deploy", "nginx", "sqr.conf.example");
const envExamplePath = path.join(repoRoot, ".env.example");
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

test("production Nginx example applies auth edge throttle to both login routes", () => {
  const nginxText = readText(nginxConfigPath);

  assertLoginLocationUsesAuthThrottle(nginxText, "= /api/login");
  assertLoginLocationUsesAuthThrottle(nginxText, "= /api/auth/login");
  assert.match(nginxText, /legacy \/api\/login path/);
});

test("Hetzner deployment guide mirrors the hardened Nginx contract", () => {
  const docText = readText(hetznerDocPath);
  const lines = activeLines(docText);
  const conflictingHeaders = lines.filter((line) =>
    /^add_header\s+(Strict-Transport-Security|X-Frame-Options)\b/i.test(line),
  );

  assert.deepEqual(conflictingHeaders, []);
  assert.match(docText, /client_max_body_size 100M;/);
  assert.match(docText, /zone=sqr_telemetry_per_ip:10m rate=60r\/m/);
  assert.match(docText, /location = \/telemetry\/web-vitals/);
  assertLoginLocationUsesAuthThrottle(docText, "= /api/login");
  assertLoginLocationUsesAuthThrottle(docText, "= /api/auth/login");
  assert.match(docText, /legacy \/api\/login path/);
  assert.match(docText, /Browser security headers kekal diurus oleh Express\/Helmet/);
  assert.match(docText, /HSTS_MAX_AGE_SECONDS=31536000/i);
  assert.match(docText, /https:\/\/hstspreload\.org/i);
});
