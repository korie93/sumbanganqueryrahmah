import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { registerLocalHttpPipeline } from "../../internal/local-http-pipeline";
import { logger } from "../../lib/logger";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../../shared/trusted-types";

test("registerLocalHttpPipeline allows blob receipt previews in the CSP header", async () => {
  const app = express();
  registerLocalHttpPipeline(app, {
    importBodyLimit: "1mb",
    collectionBodyLimit: "1mb",
    defaultBodyLimit: "100kb",
    uploadsRootDir: path.resolve(process.cwd(), "uploads"),
    recordRequestStarted: () => undefined,
    recordRequestFinished: () => undefined,
    adaptiveRateLimit: (_req, _res, next) => next(),
    systemProtectionMiddleware: (_req, _res, next) => next(),
    maintenanceGuard: (_req, _res, next) => next(),
  });
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    const csp = String(response.headers.get("content-security-policy") || "");
    assert.match(String(response.headers.get("x-frame-options") || ""), /sameorigin/i);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.match(String(response.headers.get("report-to") || ""), /"group":"sqr-csp-endpoint"/i);
    assert.match(String(response.headers.get("reporting-endpoints") || ""), /sqr-csp-endpoint="\/api\/csp-report"/i);
    assert.match(String(response.headers.get("strict-transport-security") || ""), /max-age=15552000/i);
    assert.doesNotMatch(String(response.headers.get("strict-transport-security") || ""), /preload/i);
    const permissionsPolicy = String(response.headers.get("permissions-policy") || "");
    assert.match(permissionsPolicy, /camera=\(\)/i);
    assert.match(permissionsPolicy, /geolocation=\(\)/i);
    assert.match(permissionsPolicy, /microphone=\(\)/i);
    assert.match(permissionsPolicy, /payment=\(\)/i);
    assert.match(csp, /base-uri 'self'/i);
    assert.match(csp, /connect-src 'self'/i);
    assert.match(csp, /img-src 'self' data: blob:/i);
    assert.match(csp, /frame-src 'self' blob:/i);
    assert.match(csp, /object-src 'none'/i);
    assert.match(csp, /script-src 'self'/i);
    assert.match(csp, /script-src-attr 'none'/i);
    assert.match(csp, /style-src 'self'/i);
    assert.match(csp, /style-src-elem 'self'/i);
    assert.match(csp, /style-src-elem[^;]*sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n\/auuOAhh2t92YvuXo=/i);
    assert.match(csp, /style-src-attr 'none'/i);
    assert.match(csp, /require-trusted-types-for 'script'/i);
    assert.match(csp, new RegExp(`trusted-types default ${SQR_TRUSTED_TYPES_POLICY_NAME}`, "i"));
    assert.match(csp, /report-uri \/api\/csp-report/i);
    assert.match(csp, /report-to sqr-csp-endpoint/i);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/i);
    assert.doesNotMatch(csp, /(?:^|;)\s*style-src\s+[^;]*unsafe-inline/i);
    assert.doesNotMatch(csp, /(?:^|;)\s*style-src-elem\s+[^;]*unsafe-inline/i);
    assert.doesNotMatch(csp, /style-src-attr[^;]*unsafe-inline/i);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline preserves caller-provided request ids", async () => {
  const app = express();
  registerLocalHttpPipeline(app, {
    importBodyLimit: "1mb",
    collectionBodyLimit: "1mb",
    defaultBodyLimit: "100kb",
    uploadsRootDir: path.resolve(process.cwd(), "uploads"),
    recordRequestStarted: () => undefined,
    recordRequestFinished: () => undefined,
    adaptiveRateLimit: (_req, _res, next) => next(),
    systemProtectionMiddleware: (_req, _res, next) => next(),
    maintenanceGuard: (_req, _res, next) => next(),
  });
  app.get("/request-id", (_req, res) => {
    res.json({ ok: true });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/request-id`, {
      headers: {
        "x-request-id": "req-test-123",
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "req-test-123");
    assert.equal(response.headers.get("api-version"), "1");
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline sanitizes caller-provided request ids", async () => {
  const app = express();
  registerLocalHttpPipeline(app, {
    importBodyLimit: "1mb",
    collectionBodyLimit: "1mb",
    defaultBodyLimit: "100kb",
    uploadsRootDir: path.resolve(process.cwd(), "uploads"),
    recordRequestStarted: () => undefined,
    recordRequestFinished: () => undefined,
    adaptiveRateLimit: (_req, _res, next) => next(),
    systemProtectionMiddleware: (_req, _res, next) => next(),
    maintenanceGuard: (_req, _res, next) => next(),
  });
  app.get("/request-id", (_req, res) => {
    res.json({ ok: true });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/request-id`, {
      headers: {
        "x-request-id": " api-<script>|bad id/123 ",
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "api-scriptbadid123");
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline marks truncated user agents without logging the raw value", async (t) => {
  const warningLogs: Array<{ message: string; payload: unknown }> = [];
  t.mock.method(logger, "warn", (message: string, payload: unknown) => {
    warningLogs.push({ message, payload });
  });

  const app = express();
  registerLocalHttpPipeline(app, {
    importBodyLimit: "1mb",
    collectionBodyLimit: "1mb",
    defaultBodyLimit: "100kb",
    uploadsRootDir: path.resolve(process.cwd(), "uploads"),
    recordRequestStarted: () => undefined,
    recordRequestFinished: () => undefined,
    adaptiveRateLimit: (_req, _res, next) => next(),
    systemProtectionMiddleware: (_req, _res, next) => next(),
    maintenanceGuard: (_req, _res, next) => next(),
  });
  app.get("/client-error", (_req, res) => {
    res.status(404).json({ ok: false });
  });

  const longUserAgent = `SQR-Test/${"x".repeat(260)}`;
  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/client-error`, {
      headers: {
        "user-agent": longUserAgent,
      },
    });

    assert.equal(response.status, 404);
    assert.equal(warningLogs.length, 1);
    assert.equal(warningLogs[0].message, "HTTP request completed with client error");
    assert.equal((warningLogs[0].payload as { userAgent?: string }).userAgent?.length, 180);
    assert.equal((warningLogs[0].payload as { userAgentTruncated?: boolean }).userAgentTruncated, true);
    assert.notEqual((warningLogs[0].payload as { userAgent?: string }).userAgent, longUserAgent);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline blocks direct public uploads", async () => {
  const uploadsRootDir = await mkdtemp(path.join(os.tmpdir(), "sqr-uploads-"));
  await writeFile(path.join(uploadsRootDir, "sample report.txt"), "example upload", "utf8");
  await mkdir(path.join(uploadsRootDir, "collection-receipts"), { recursive: true });
  await mkdir(path.join(uploadsRootDir, "receipts"), { recursive: true });
  await writeFile(path.join(uploadsRootDir, "collection-receipts", "managed.jpg"), "managed", "utf8");
  await writeFile(path.join(uploadsRootDir, "receipts", "legacy-proof.jpg"), "legacy", "utf8");

  const app = express();
  registerLocalHttpPipeline(app, {
    importBodyLimit: "1mb",
    collectionBodyLimit: "1mb",
    defaultBodyLimit: "100kb",
    uploadsRootDir,
    recordRequestStarted: () => undefined,
    recordRequestFinished: () => undefined,
    adaptiveRateLimit: (_req, _res, next) => next(),
    systemProtectionMiddleware: (_req, _res, next) => next(),
    maintenanceGuard: (_req, _res, next) => next(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const directUploadResponse = await fetch(`${baseUrl}/uploads/sample%20report.txt`);
    assert.equal(directUploadResponse.status, 404);
    assert.equal(directUploadResponse.headers.get("content-disposition"), null);
    assert.deepEqual(await directUploadResponse.json(), { ok: false, message: "Not found." });

    const managedReceiptResponse = await fetch(`${baseUrl}/uploads/collection-receipts/managed.jpg`);
    assert.equal(managedReceiptResponse.status, 404);

    const legacyReceiptResponse = await fetch(`${baseUrl}/uploads/receipts/legacy-proof.jpg`);
    assert.equal(legacyReceiptResponse.status, 404);
  } finally {
    await stopTestServer(server);
    await rm(uploadsRootDir, { recursive: true, force: true });
  }
});
