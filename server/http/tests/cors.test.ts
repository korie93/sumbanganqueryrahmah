import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCorsMiddleware, resolveAllowedCorsOrigins } from "../cors";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

function createCorsTestApp(allowedOrigins?: string[]) {
  const app = express();
  app.use(createCorsMiddleware(allowedOrigins));
  app.get("/ping", (_req, res) => {
    res.json({ ok: true });
  });
  app.options("/ping", (_req, res) => {
    res.sendStatus(204);
  });
  return app;
}

test("resolveAllowedCorsOrigins includes configured and local dev origins", () => {
  const allowed = resolveAllowedCorsOrigins({
    NODE_ENV: "development",
    ALLOW_LOCAL_DEV_CORS: "1",
    PUBLIC_APP_URL: "http://localhost:5000/app",
    CORS_ALLOWED_ORIGINS: "https://app.example.com, https://admin.example.com",
  });

  assert.ok(allowed.includes("https://app.example.com"));
  assert.ok(allowed.includes("https://admin.example.com"));
  assert.ok(allowed.includes("http://localhost:5000"));
  assert.ok(allowed.includes("http://localhost:5173"));
});

test("resolveAllowedCorsOrigins keeps local dev origins opt-in outside production", () => {
  const allowed = resolveAllowedCorsOrigins({
    NODE_ENV: "development",
    PUBLIC_APP_URL: "https://staging.example.com",
    CORS_ALLOWED_ORIGINS: "https://admin.example.com",
  });

  assert.ok(allowed.includes("https://staging.example.com"));
  assert.ok(allowed.includes("https://admin.example.com"));
  assert.equal(allowed.includes("http://localhost:5000"), false);
  assert.equal(allowed.includes("http://localhost:5173"), false);
});

test("allowed origins receive an exact Access-Control-Allow-Origin header", async () => {
  const app = createCorsTestApp(["https://app.example.com"]);
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/ping`, {
      headers: {
        Origin: "https://app.example.com",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.equal((await response.json()).ok, true);
  } finally {
    await stopTestServer(server);
  }
});

test("disallowed origins are rejected safely", async () => {
  const app = createCorsTestApp(["https://app.example.com"]);
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/ping`, {
      headers: {
        Origin: "https://evil.example.com",
      },
    });

    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: "CORS_ORIGIN_DENIED",
        message: "Origin is not allowed.",
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("requests without an Origin header continue normally", async () => {
  const app = createCorsTestApp(["https://app.example.com"]);
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/ping`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal((await response.json()).ok, true);
  } finally {
    await stopTestServer(server);
  }
});
