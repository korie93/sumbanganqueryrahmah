import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRequestTimeoutMiddleware } from "../request-timeout-middleware";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

test("createRequestTimeoutMiddleware returns 504 safely even when no request context is registered", async () => {
  const app = express();
  app.use(createRequestTimeoutMiddleware({ timeoutMs: 25 }));
  app.get("/slow", async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
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
          timeoutMs: 25,
        },
      },
    });
  } finally {
    await stopTestServer(server);
  }
});
