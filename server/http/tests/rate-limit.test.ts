import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createImportsUploadRateLimiter } from "../../middleware/rate-limit";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { ERROR_CODES } from "../../../shared/error-codes";

test("JSON rate limiter emits Retry-After alongside the existing 429 payload", async () => {
  const app = express();
  app.use(express.json());
  app.post(
    "/api/imports",
    createImportsUploadRateLimiter({
      windowMs: 60_000,
      max: 1,
    }),
    (_req, res) => {
      res.status(202).json({ ok: true });
    },
  );

  const { server, baseUrl } = await startTestServer(app);
  try {
    const firstResponse = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Initial import" }),
    });
    assert.equal(firstResponse.status, 202);

    const throttledResponse = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Overflow import" }),
    });
    assert.equal(throttledResponse.status, 429);
    const retryAfter = Number(throttledResponse.headers.get("retry-after"));
    assert.ok(Number.isFinite(retryAfter));
    assert.ok(retryAfter >= 59);
    assert.ok(retryAfter <= 60);
    assert.equal(throttledResponse.headers.get("x-ratelimit-limit"), "1");
    assert.equal(throttledResponse.headers.get("x-ratelimit-remaining"), "0");
    const resetAt = Number(throttledResponse.headers.get("x-ratelimit-reset"));
    assert.ok(Number.isFinite(resetAt));
    assert.ok(resetAt >= Math.floor(Date.now() / 1000));
    assert.deepEqual(await throttledResponse.json(), {
      ok: false,
      error: {
        code: ERROR_CODES.IMPORT_UPLOAD_RATE_LIMITED,
        message: "Too many import upload attempts from this network. Please wait before trying again.",
      },
    });
  } finally {
    await stopTestServer(server);
  }
});
