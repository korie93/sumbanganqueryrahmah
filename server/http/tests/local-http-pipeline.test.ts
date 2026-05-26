import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import express from "express";
import { registerLocalHttpPipeline } from "../../internal/local-http-pipeline";
import { logger } from "../../lib/logger";
import { errorHandler } from "../../middleware/error-handler";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../../shared/trusted-types";

function requestRaw(urlString: string, headers: Record<string, string> = {}) {
  const url = new URL(urlString);
  return new Promise<{
    body: Buffer;
    headers: http.IncomingHttpHeaders;
    statusCode: number;
  }>((resolve, reject) => {
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({
          body: Buffer.concat(chunks),
          headers: response.headers,
          statusCode: response.statusCode ?? 0,
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

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
    assert.match(permissionsPolicy, /accelerometer=\(\)/i);
    assert.match(permissionsPolicy, /display-capture=\(\)/i);
    assert.match(permissionsPolicy, /geolocation=\(\)/i);
    assert.match(permissionsPolicy, /gyroscope=\(\)/i);
    assert.match(permissionsPolicy, /magnetometer=\(\)/i);
    assert.match(permissionsPolicy, /microphone=\(\)/i);
    assert.match(permissionsPolicy, /payment=\(\)/i);
    assert.match(permissionsPolicy, /screen-wake-lock=\(\)/i);
    assert.match(permissionsPolicy, /usb=\(\)/i);
    assert.match(permissionsPolicy, /xr-spatial-tracking=\(\)/i);
    assert.doesNotMatch(permissionsPolicy, /document-domain/i);
    assert.doesNotMatch(permissionsPolicy, /web-share/i);
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

test("registerLocalHttpPipeline rejects unsupported API versions while preserving version 1 compatibility", async () => {
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
  app.get("/api/versioned", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const defaultVersionResponse = await fetch(`${baseUrl}/api/versioned`);
    assert.equal(defaultVersionResponse.status, 200);
    assert.equal(defaultVersionResponse.headers.get("api-version"), "1");

    const explicitVersionOneResponse = await fetch(`${baseUrl}/api/versioned`, {
      headers: {
        "API-Version": "1",
      },
    });
    assert.equal(explicitVersionOneResponse.status, 200);

    const unsupportedVersionResponse = await fetch(`${baseUrl}/api/versioned`, {
      headers: {
        "API-Version": "2",
      },
    });
    assert.equal(unsupportedVersionResponse.status, 406);
    const unsupportedVersionPayload = await unsupportedVersionResponse.json() as {
      ok: boolean;
      message: string;
      requestId?: string;
      error?: {
        code?: string;
        message?: string;
        details?: {
          requestedVersion?: string;
          supportedVersions?: string[];
        };
      };
    };
    assert.equal(unsupportedVersionPayload.ok, false);
    assert.equal(unsupportedVersionPayload.message, "Unsupported API version.");
    assert.equal(typeof unsupportedVersionPayload.requestId, "string");
    assert.deepEqual(unsupportedVersionPayload.error, {
      code: "UNSUPPORTED_API_VERSION",
      message: "Unsupported API version.",
      details: {
        requestedVersion: "2",
        supportedVersions: ["1"],
      },
    });

    const nonApiResponse = await fetch(`${baseUrl}/versioned`, {
      headers: {
        "API-Version": "2",
      },
    });
    assert.equal(nonApiResponse.status, 404);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline marks API responses as non-cacheable by default", async () => {
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
  app.get("/api/cache-test", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/cache-test", (_req, res) => {
    res.json({ ok: true });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const apiResponse = await fetch(`${baseUrl}/api/cache-test`);
    assert.equal(apiResponse.status, 200);
    assert.equal(apiResponse.headers.get("cache-control"), "no-store");
    assert.equal(apiResponse.headers.get("pragma"), "no-cache");

    const nonApiResponse = await fetch(`${baseUrl}/cache-test`);
    assert.equal(nonApiResponse.status, 200);
    assert.equal(nonApiResponse.headers.get("cache-control"), null);
    assert.equal(nonApiResponse.headers.get("pragma"), null);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline applies the 4KB web-vitals body limit to canonical and legacy telemetry paths", async () => {
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
  app.post(["/api/telemetry/web-vitals", "/telemetry/web-vitals"], (req, res) => {
    res.json({ ok: true, bytes: JSON.stringify(req.body).length });
  });

  const { server, baseUrl } = await startTestServer(app);
  const oversizedPayload = JSON.stringify({ id: "metric", padding: "x".repeat(4_500) });
  try {
    for (const pathName of ["/api/telemetry/web-vitals", "/telemetry/web-vitals"]) {
      const response = await fetch(`${baseUrl}${pathName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: oversizedPayload,
      });
      assert.equal(response.status, 413);
    }
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline compresses large API responses without touching non-API responses", async () => {
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
  const payload = { ok: true, data: "x".repeat(4096) };
  app.get("/api/large-response", (_req, res) => {
    res.json(payload);
  });
  app.get("/large-response", (_req, res) => {
    res.json(payload);
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const apiResponse = await requestRaw(`${baseUrl}/api/large-response`, {
      "accept-encoding": "gzip",
    });
    assert.equal(apiResponse.statusCode, 200);
    assert.equal(apiResponse.headers["content-encoding"], "gzip");
    assert.deepEqual(JSON.parse(gunzipSync(apiResponse.body).toString("utf8")), payload);

    const nonApiResponse = await requestRaw(`${baseUrl}/large-response`, {
      "accept-encoding": "gzip",
    });
    assert.equal(nonApiResponse.statusCode, 200);
    assert.equal(nonApiResponse.headers["content-encoding"], undefined);
    assert.deepEqual(JSON.parse(nonApiResponse.body.toString("utf8")), payload);
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
