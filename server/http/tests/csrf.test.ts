import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCsrfProtectionMiddleware } from "../csrf";
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
  } finally {
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
  } finally {
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
