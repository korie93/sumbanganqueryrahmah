import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import express from "express";
import { registerLocalHttpPipeline } from "../../internal/local-http-pipeline";
import { logger } from "../../lib/logger";
import { getRequestContext } from "../../lib/request-context";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../../shared/trusted-types";

async function requestRaw(baseUrl: string, requestPath: string) {
  const url = new URL(requestPath, baseUrl);

  return new Promise<{
    body: Buffer;
    headers: http.IncomingHttpHeaders;
    statusCode: number;
  }>((resolve, reject) => {
    const request = http.request(url, {
      headers: {
        "accept-encoding": "gzip",
      },
    }, (response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
    assert.match(String(response.headers.get("x-frame-options") || ""), /deny/i);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(String(response.headers.get("strict-transport-security") || ""), /max-age=15552000/i);
    assert.match(String(response.headers.get("strict-transport-security") || ""), /preload/i);
    assert.match(csp, /base-uri 'self'/i);
    assert.match(csp, /img-src 'self' data: blob:/i);
    assert.match(csp, /frame-src 'self' blob:/i);
    assert.match(csp, /object-src 'none'/i);
    assert.match(csp, /report-uri \/api\/security\/csp-reports/i);
    assert.match(csp, /script-src 'self'/i);
    assert.match(csp, /script-src-attr 'none'/i);
    assert.match(csp, /require-trusted-types-for 'script'/i);
    assert.match(csp, new RegExp(`trusted-types default ${SQR_TRUSTED_TYPES_POLICY_NAME}`, "i"));
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/i);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline accepts sanitized CSP violation reports", async (t) => {
  const warnings: Array<Record<string, unknown> | undefined> = [];
  t.mock.method(logger, "warn", ((message: string, payload?: Record<string, unknown>) => {
    if (message === "Content Security Policy violation report received") {
      warnings.push(payload);
    }
  }) as typeof logger.warn);

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

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/security/csp-reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/csp-report",
      },
      body: JSON.stringify({
        "csp-report": {
          "document-uri": "https://sqr.example.com/dashboard",
          "blocked-uri": "https://evil.example/inline.js",
          "violated-directive": "script-src-elem",
          "effective-directive": "script-src-elem",
        },
      }),
    });

    assert.equal(response.status, 204);
    assert.deepEqual(warnings, [
      {
        blockedUri: "https://evil.example/inline.js",
        documentUri: "https://sqr.example.com/dashboard",
        effectiveDirective: "script-src-elem",
        originalPolicy: undefined,
        reportCount: 1,
        referrer: undefined,
        violatedDirective: "script-src-elem",
      },
    ]);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline aggregates repeated CSP violation reports instead of logging every duplicate", async (t) => {
  const warnings: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  t.mock.method(logger, "warn", ((message: string, payload?: Record<string, unknown>) => {
    if (/Content Security Policy violation report/.test(message)) {
      warnings.push({ message, payload });
    }
  }) as typeof logger.warn);

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

  const { server, baseUrl } = await startTestServer(app);
  const body = JSON.stringify({
    "csp-report": {
      "document-uri": "https://sqr.example.com/dashboard",
      "blocked-uri": "https://evil.example/inline.js",
      "violated-directive": "script-src-elem",
      "effective-directive": "script-src-elem",
    },
  });

  try {
    const first = await fetch(`${baseUrl}/api/security/csp-reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/csp-report",
      },
      body,
    });
    const second = await fetch(`${baseUrl}/api/security/csp-reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/csp-report",
      },
      body,
    });

    assert.equal(first.status, 204);
    assert.equal(second.status, 204);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.message, "Content Security Policy violation report received");
    assert.equal(warnings[0]?.payload?.reportCount, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline keeps urlencoded request bodies flat for API routes", async () => {
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
  app.post("/api/urlencoded", (req, res) => {
    res.json(req.body);
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/urlencoded`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "profile[name]=alice&flat=value",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      "profile[name]": "alice",
      flat: "value",
    });
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline rejects malformed CSP violation reports", async () => {
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

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/security/csp-reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        invalid: true,
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Invalid CSP report payload.",
    });
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

test("registerLocalHttpPipeline serves generic uploads as attachments", async () => {
  const uploadsRootDir = await mkdtemp(path.join(os.tmpdir(), "sqr-uploads-"));
  await writeFile(
    path.join(uploadsRootDir, "sample report.txt"),
    "example upload ".repeat(400),
    "utf8",
  );

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
    const response = await fetch(`${baseUrl}/uploads/sample%20report.txt`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="sample_report.txt"');
    assert.equal(await response.text(), "example upload ".repeat(400));
  } finally {
    await stopTestServer(server);
    await rm(uploadsRootDir, { recursive: true, force: true });
  }
});

test("registerLocalHttpPipeline compresses large API JSON responses", async () => {
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
  app.get("/api/large-json", (_req, res) => {
    res.json({
      items: Array.from({ length: 200 }, (_, index) => ({
        id: index,
        label: `dashboard-item-${index.toString().padStart(3, "0")}`,
      })),
    });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await requestRaw(baseUrl, "/api/large-json");

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-encoding"], "gzip");
    assert.match(String(response.headers.vary || ""), /accept-encoding/i);
    assert.equal(JSON.parse(gunzipSync(response.body).toString("utf8")).items.length, 200);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline skips compression for attachment-oriented uploads", async () => {
  const uploadsRootDir = await mkdtemp(path.join(os.tmpdir(), "sqr-uploads-"));
  const largeUploadText = "example upload ".repeat(400);
  await writeFile(path.join(uploadsRootDir, "sample report.txt"), largeUploadText, "utf8");

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
    const response = await requestRaw(baseUrl, "/uploads/sample%20report.txt");

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-encoding"], undefined);
    assert.equal(response.body.toString("utf8"), largeUploadText);
  } finally {
    await stopTestServer(server);
    await rm(uploadsRootDir, { recursive: true, force: true });
  }
});

test("registerLocalHttpPipeline logs compression metadata for compressed API error responses", async (t) => {
  const errorLogs: Array<Record<string, unknown> | undefined> = [];
  t.mock.method(logger, "error", ((message: string, metadata?: Record<string, unknown>) => {
    if (message === "HTTP request completed with server error") {
      errorLogs.push(metadata);
    }
  }) as typeof logger.error);

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
  app.get("/api/error-json", (_req, res) => {
    res.status(500).json({
      items: Array.from({ length: 200 }, (_, index) => ({
        id: index,
        label: `error-item-${index.toString().padStart(3, "0")}`,
      })),
    });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await requestRaw(baseUrl, "/api/error-json");
    assert.equal(response.statusCode, 500);
    assert.equal(response.headers["content-encoding"], "gzip");
    assert.equal(errorLogs.length, 1);
    assert.equal(errorLogs[0]?.method, "GET");
    assert.equal(errorLogs[0]?.path, "/api/error-json");
    assert.equal(errorLogs[0]?.statusCode, 500);
    assert.equal(errorLogs[0]?.responseEncoding, "gzip");
    assert.equal(errorLogs[0]?.compressionEligible, true);
    assert.equal(errorLogs[0]?.compressionBypassed, false);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline returns 504 and aborts the request context when the global timeout elapses", async () => {
  const app = express();
  let abortObserved = false;

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
    requestTimeoutMs: 40,
  });

  app.get("/slow", async (_req, res) => {
    const abortSignal = getRequestContext()?.abortSignal;
    await new Promise<void>((resolve) => {
      abortSignal?.addEventListener("abort", () => {
        abortObserved = true;
        resolve();
      }, { once: true });
    });

    if (!res.headersSent) {
      res.json({ ok: true });
    }
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/slow`);
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "The request took too long to complete.",
      error: {
        code: "REQUEST_TIMEOUT",
        message: "The request took too long to complete.",
        details: {
          timeoutMs: 40,
        },
      },
    });
    assert.equal(abortObserved, true);
  } finally {
    await stopTestServer(server);
  }
});

test("registerLocalHttpPipeline honors backup timeout overrides ahead of the global timeout", async () => {
  const app = express();
  let abortObserved = false;

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
    requestTimeoutMs: 40,
    backupOperationTimeoutMs: 120,
  });

  app.get("/api/backups/slow", async (_req, res) => {
    const abortSignal = getRequestContext()?.abortSignal;
    await new Promise<void>((resolve) => {
      abortSignal?.addEventListener("abort", () => {
        abortObserved = true;
        resolve();
      }, { once: true });
    });

    if (!res.headersSent) {
      res.json({ ok: true });
    }
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/backups/slow`);
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "The request took too long to complete.",
      error: {
        code: "REQUEST_TIMEOUT",
        message: "The request took too long to complete.",
        details: {
          timeoutMs: 120,
        },
      },
    });
    assert.equal(abortObserved, true);
  } finally {
    await stopTestServer(server);
  }
});
