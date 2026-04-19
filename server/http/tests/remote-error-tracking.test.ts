import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteErrorTracker,
} from "../../lib/remote-error-tracking";

test("remote error tracker forwards sanitized client runtime errors when enabled", async () => {
  const deliveredPayloads: unknown[] = [];
  const tracker = createRemoteErrorTracker({
    config: {
      enabled: true,
      endpoint: "https://errors.example.com/ingest",
      timeoutMs: 1_000,
      environment: "production",
      release: "1.2.3",
      service: "sqr",
    },
    fetchImpl: (async (_input, init) => {
      deliveredPayloads.push(JSON.parse(String(init?.body || "{}")));
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  });

  await tracker.captureClientError({
    message: "Floating AI render failed",
    source: "error-boundary",
    pagePath: "/dashboard",
    errorName: "TypeError",
    component: "FloatingAI",
    boundaryKey: "dashboard:1",
    ts: "2026-04-17T12:00:00.000Z",
  }, {
    requestId: "req-client-1",
  });

  assert.equal(deliveredPayloads.length, 1);
  assert.deepEqual(deliveredPayloads[0], {
    client: {
      boundaryKey: "dashboard:1",
      component: "FloatingAI",
      errorName: "TypeError",
      pagePath: "/dashboard",
      source: "error-boundary",
    },
    environment: "production",
    eventType: "client.runtime_error",
    release: "1.2.3",
    request: {
      id: "req-client-1",
    },
    service: "sqr",
    severity: "error",
    source: "client",
    ts: "2026-04-17T12:00:00.000Z",
    error: {
      message: "Floating AI render failed",
      name: "TypeError",
    },
  });
});

test("remote error tracker redacts emails and secret-like values before external delivery", async () => {
  const deliveredPayloads: unknown[] = [];
  const tracker = createRemoteErrorTracker({
    config: {
      enabled: true,
      endpoint: "https://errors.example.com/ingest",
      timeoutMs: 1_000,
      environment: "production",
      release: "1.2.3",
      service: "sqr",
    },
    fetchImpl: (async (_input, init) => {
      deliveredPayloads.push(JSON.parse(String(init?.body || "{}")));
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  });

  await tracker.captureServerError({
    errorName: "Error",
    message: "Reset for alice@example.com failed at /reset-password?token=eyJhbGciOiJIUzI1NiJ9.abcdefghijk.lmnopqrstuv with Bearer abcdefghijklmnop",
    method: "POST",
    path: "/api/auth/reset-password-with-token",
    requestId: "req-server-sensitive",
    statusCode: 500,
  });

  assert.equal(deliveredPayloads.length, 1);
  const deliveredPayload = deliveredPayloads[0] as {
    environment?: string;
    error?: { message?: string; name?: string };
    eventType?: string;
    release?: string;
    request?: { id?: string; method?: string; path?: string; statusCode?: number };
    service?: string;
    severity?: string;
    source?: string;
    ts?: string;
  };

  assert.equal(deliveredPayload.environment, "production");
  assert.equal(deliveredPayload.eventType, "server.request_error");
  assert.equal(deliveredPayload.release, "1.2.3");
  assert.equal(deliveredPayload.request?.id, "req-server-sensitive");
  assert.equal(deliveredPayload.request?.method, "POST");
  assert.equal(deliveredPayload.request?.path, "/api/auth/reset-password-with-token");
  assert.equal(deliveredPayload.request?.statusCode, 500);
  assert.equal(deliveredPayload.service, "sqr");
  assert.equal(deliveredPayload.severity, "error");
  assert.equal(deliveredPayload.source, "server");
  assert.match(String(deliveredPayload.ts || ""), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(deliveredPayload.error?.name, "Error");
  assert.equal(
    deliveredPayload.error?.message,
    "Reset for [REDACTED_EMAIL] failed at /reset-password?token=[REDACTED] with Bearer [REDACTED]",
  );
});

test("remote error tracker bounds delivery failures to warnings without throwing", async () => {
  const warningLogs: Array<Record<string, unknown> | undefined> = [];
  const tracker = createRemoteErrorTracker({
    config: {
      enabled: true,
      endpoint: "https://errors.example.com/ingest",
      timeoutMs: 1_000,
      environment: "production",
      release: null,
      service: "sqr",
    },
    fetchImpl: (async () => {
      throw new Error("network unreachable");
    }) as typeof fetch,
    log: {
      info() {},
      debug() {},
      error() {},
      warn(_message, meta) {
        warningLogs.push(meta);
      },
    },
    now: (() => new Date("2026-04-17T12:00:00.000Z")),
  });

  await tracker.captureServerError({
    errorName: "Error",
    message: "Call 012-3456789 failed",
    method: "GET",
    path: "/api/settings",
    requestId: "req-server-1",
    statusCode: 500,
  });

  await tracker.captureServerError({
    errorName: "Error",
    message: "Call 012-3456789 failed again",
    method: "GET",
    path: "/api/settings",
    requestId: "req-server-2",
    statusCode: 500,
  });

  assert.equal(warningLogs.length, 1);
  assert.equal(warningLogs[0]?.errorName, "Error");
  assert.equal(warningLogs[0]?.errorMessage, "network unreachable");
});
