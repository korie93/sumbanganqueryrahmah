import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCsrfProtectionMiddleware } from "../csrf";
import { logger } from "../../lib/logger";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

function createCsrfTestApp() {
  const app = express();
  app.use(express.json());
  app.use(
    createCsrfProtectionMiddleware({
      allowedOrigins: ["http://127.0.0.1:5000"],
    }),
  );
  app.post("/api/mutate", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

test("csrf middleware rejects cross-site mutation requests when session cookie is present", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);
  const originalWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];
  logger.warn = ((message: string, payload: unknown) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: "sqr_auth=token-value; sqr_csrf=csrf-token",
        "sec-fetch-site": "cross-site",
      },
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, "CSRF_REJECTED");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "CSRF request rejected");
  } finally {
    logger.warn = originalWarn;
    await stopTestServer(server);
  }
});

test("csrf middleware accepts session mutations with a valid double-submit token", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: "sqr_auth=token-value; sqr_csrf=csrf-token",
        "X-CSRF-Token": "csrf-token",
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware rejects cookie-authenticated mutations that omit all CSRF validation signals", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);
  const originalWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];
  logger.warn = ((message: string, payload: unknown) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: "sqr_auth=token-value; sqr_csrf=csrf-token",
      },
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, "CSRF_SIGNAL_MISSING");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "CSRF request rejected");
  } finally {
    logger.warn = originalWarn;
    await stopTestServer(server);
  }
});

test("csrf middleware logs invalid origin rejections with the normalized origin", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);
  const originalWarn = logger.warn;
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  logger.warn = ((message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: "sqr_auth=token-value; sqr_csrf=csrf-token",
        Origin: "https://evil.example",
      },
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, "CSRF_ORIGIN_REJECTED");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "CSRF request rejected");
    assert.equal(warnings[0].payload.code, "CSRF_ORIGIN_REJECTED");
    assert.equal(warnings[0].payload.requestOrigin, "https://evil.example");
  } finally {
    logger.warn = originalWarn;
    await stopTestServer(server);
  }
});

test("csrf middleware accepts cookie-authenticated mutations with a same-origin fetch metadata signal", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: "sqr_auth=token-value; sqr_csrf=csrf-token",
        "sec-fetch-site": "same-origin",
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware allows requests without auth session cookies", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await stopTestServer(server);
  }
});
