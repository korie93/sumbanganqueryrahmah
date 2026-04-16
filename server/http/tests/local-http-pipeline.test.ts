import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { registerLocalHttpPipeline } from "../../internal/local-http-pipeline";
import { getRequestContext } from "../../lib/request-context";
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
    assert.match(String(response.headers.get("strict-transport-security") || ""), /max-age=15552000/i);
    assert.match(String(response.headers.get("strict-transport-security") || ""), /preload/i);
    assert.match(csp, /base-uri 'self'/i);
    assert.match(csp, /img-src 'self' data: blob:/i);
    assert.match(csp, /frame-src 'self' blob:/i);
    assert.match(csp, /object-src 'none'/i);
    assert.match(csp, /script-src 'self'/i);
    assert.match(csp, /script-src-attr 'none'/i);
    assert.match(csp, /require-trusted-types-for 'script'/i);
    assert.match(csp, new RegExp(`trusted-types default ${SQR_TRUSTED_TYPES_POLICY_NAME}`, "i"));
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/i);
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
  await writeFile(path.join(uploadsRootDir, "sample report.txt"), "example upload", "utf8");

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
    assert.equal(await response.text(), "example upload");
  } finally {
    await stopTestServer(server);
    await rm(uploadsRootDir, { recursive: true, force: true });
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
