import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import express from "express";
import { registerLocalHttpPipeline } from "../../internal/local-http-pipeline";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

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
    assert.match(csp, /img-src 'self' data: blob:/i);
    assert.match(csp, /frame-src 'self' blob:/i);
  } finally {
    await stopTestServer(server);
  }
});
