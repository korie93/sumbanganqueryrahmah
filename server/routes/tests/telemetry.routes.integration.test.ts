import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createWebVitalsTelemetryController } from "../../controllers/web-vitals-telemetry.controller";
import { errorHandler } from "../../middleware/error-handler";
import {
  createWebVitalsTelemetryDropGuard,
  createWebVitalsTelemetryRequestGuard,
  registerTelemetryRoutes,
  registerWebVitalsTelemetryDropGuardCleanup,
} from "../telemetry.routes";
import {
  createJsonTestApp,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";
import type { Request, Response } from "express";

function createTelemetryRouteHarness(options: {
  webVitalsDropGuard?: Parameters<typeof registerTelemetryRoutes>[1]["webVitalsDropGuard"];
  webVitalsRequestGuard?: Parameters<typeof registerTelemetryRoutes>[1]["webVitalsRequestGuard"];
} = {}) {
  const recordedPayloads: Array<Record<string, unknown>> = [];

  const app = createJsonTestApp();
  registerTelemetryRoutes(app, {
    ...(options.webVitalsDropGuard ? { webVitalsDropGuard: options.webVitalsDropGuard } : {}),
    ...(options.webVitalsRequestGuard ? { webVitalsRequestGuard: options.webVitalsRequestGuard } : {}),
    reportWebVital: createWebVitalsTelemetryController({
      webVitalsTelemetryService: {
        record(payload) {
          recordedPayloads.push(payload as Record<string, unknown>);
        },
      },
    }).report,
  });
  app.use(errorHandler);

  return {
    app,
    recordedPayloads,
  };
}

function createValidWebVitalsPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "LCP",
    value: 2034.781,
    delta: 120.5,
    rating: "good",
    id: "v3-1710000000000-1234567890",
    path: "/login",
    pageType: "public",
    navigationType: "navigate",
    visibilityState: "visible",
    effectiveConnectionType: "4g",
    saveData: false,
    ts: "2026-04-04T08:30:00.000Z",
    ...overrides,
  };
}

function runDropGuard(
  guard: ReturnType<typeof createWebVitalsTelemetryDropGuard>,
  ip: string,
) {
  let statusCode = 200;
  let ended = false;
  let nextCalled = false;

  const req = {
    ip,
    socket: {
      remoteAddress: ip,
    },
    headers: {},
  } as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    end() {
      ended = true;
      return this;
    },
  } as unknown as Response;

  guard(req, res, () => {
    nextCalled = true;
  });

  return { statusCode, ended, nextCalled };
}

test("POST /telemetry/web-vitals accepts a valid web vitals payload", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createValidWebVitalsPayload()),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 1);
    assert.equal(recordedPayloads[0]?.name, "LCP");
    assert.equal(recordedPayloads[0]?.path, "/login");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals silently drops excess samples per client window", async () => {
  let nowMs = 1_000;
  const { app, recordedPayloads } = createTelemetryRouteHarness({
    webVitalsDropGuard: createWebVitalsTelemetryDropGuard({
      maxEventsPerWindow: 2,
      now: () => nowMs,
      windowMs: 1_000,
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  const postMetric = (id: string) => fetch(`${baseUrl}/telemetry/web-vitals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createValidWebVitalsPayload({ id })),
  });

  try {
    const first = await postMetric("v3-1710000000000-1");
    const second = await postMetric("v3-1710000000000-2");
    const dropped = await postMetric("v3-1710000000000-3");

    assert.equal(first.status, 204);
    assert.equal(second.status, 204);
    assert.equal(dropped.status, 204);
    assert.equal(recordedPayloads.length, 2);

    nowMs += 1_001;
    const afterWindow = await postMetric("v3-1710000000000-4");
    assert.equal(afterWindow.status, 204);
    assert.equal(recordedPayloads.length, 3);
  } finally {
    await stopTestServer(server);
  }
});

test("web vitals drop guard evicts the oldest buckets once the configured cap is exceeded", () => {
  const nowMs = 1_000;
  const guard = createWebVitalsTelemetryDropGuard({
    maxEventsPerWindow: 1,
    maxBuckets: 2,
    now: () => nowMs,
    windowMs: 10_000,
  });

  assert.deepEqual(runDropGuard(guard, "10.0.0.1"), {
    statusCode: 200,
    ended: false,
    nextCalled: true,
  });
  assert.deepEqual(runDropGuard(guard, "10.0.0.2"), {
    statusCode: 200,
    ended: false,
    nextCalled: true,
  });
  assert.deepEqual(runDropGuard(guard, "10.0.0.3"), {
    statusCode: 200,
    ended: false,
    nextCalled: true,
  });

  assert.deepEqual(runDropGuard(guard, "10.0.0.1"), {
    statusCode: 200,
    ended: false,
    nextCalled: true,
  });
  assert.deepEqual(runDropGuard(guard, "10.0.0.1"), {
    statusCode: 204,
    ended: true,
    nextCalled: false,
  });
  assert.deepEqual(runDropGuard(guard, "10.0.0.3"), {
    statusCode: 204,
    ended: true,
    nextCalled: false,
  });
});

test("web vitals drop guard removes idle buckets on the next request after the window expires", () => {
  let nowMs = 0;
  const guard = createWebVitalsTelemetryDropGuard({
    maxEventsPerWindow: 1,
    maxBuckets: 2,
    now: () => nowMs,
    windowMs: 1_000,
  });

  assert.deepEqual(runDropGuard(guard, "10.0.1.1"), {
    statusCode: 200,
    ended: false,
    nextCalled: true,
  });

  nowMs = 1_500;
  assert.deepEqual(runDropGuard(guard, "10.0.1.2"), {
    statusCode: 200,
    ended: false,
    nextCalled: true,
  });
  assert.deepEqual(runDropGuard(guard, "10.0.1.1"), {
    statusCode: 200,
    ended: false,
    nextCalled: true,
  });
});

test("web vitals drop guard sweeps expired buckets without waiting for request traffic", (t) => {
  let nowMs = 0;
  let intervalCallback: (() => void) | null = null;
  let intervalDelayMs: number | undefined;
  let clearedHandle: unknown = null;
  const intervalHandle = {
    unref: () => undefined,
  };

  t.mock.method(globalThis, "setInterval", (((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
    intervalDelayMs = delay;
    intervalCallback = () => {
      if (typeof callback === "function") {
        callback(...args);
      }
    };
    return intervalHandle as unknown as ReturnType<typeof setInterval>;
  }) as unknown) as typeof globalThis.setInterval);
  t.mock.method(globalThis, "clearInterval", ((handle?: Parameters<typeof clearInterval>[0]) => {
    clearedHandle = handle;
  }) as typeof globalThis.clearInterval);

  const guard = createWebVitalsTelemetryDropGuard({
    maxEventsPerWindow: 1,
    maxBuckets: 2,
    now: () => nowMs,
    sweepIntervalMs: 250,
    windowMs: 1_000,
  });

  assert.equal(intervalDelayMs, 250);
  assert.deepEqual(runDropGuard(guard, "10.0.2.1"), {
    statusCode: 200,
    ended: false,
    nextCalled: true,
  });
  assert.deepEqual(runDropGuard(guard, "10.0.2.1"), {
    statusCode: 204,
    ended: true,
    nextCalled: false,
  });

  nowMs = 1_500;
  (intervalCallback as unknown as () => void)();

  assert.deepEqual(runDropGuard(guard, "10.0.2.1"), {
    statusCode: 200,
    ended: false,
    nextCalled: true,
  });

  guard.stopWebVitalsTelemetryDropGuard?.();
  assert.equal(clearedHandle, intervalHandle);
});

test("web vitals drop guard lifecycle cleanup stops the guard on server close", () => {
  const server = new EventEmitter();
  let stopCalls = 0;
  const guard = createWebVitalsTelemetryDropGuard({
    sweepIntervalMs: false,
  });
  guard.stopWebVitalsTelemetryDropGuard = () => {
    stopCalls += 1;
  };

  registerWebVitalsTelemetryDropGuardCleanup(server, guard);

  server.emit("close");
  server.emit("close");

  assert.equal(stopCalls, 1);
});

test("POST /telemetry/web-vitals silently drops cross-site browser telemetry attempts", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness({
    webVitalsRequestGuard: createWebVitalsTelemetryRequestGuard({
      allowedOrigins: ["https://sqr-system.test"],
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
      },
      body: JSON.stringify(createValidWebVitalsPayload()),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals accepts same-origin browser telemetry signals", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness({
    webVitalsRequestGuard: createWebVitalsTelemetryRequestGuard({
      allowedOrigins: ["https://sqr-system.test"],
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://sqr-system.test",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify(createValidWebVitalsPayload()),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals silently drops malformed same-site headers", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness({
    webVitalsRequestGuard: createWebVitalsTelemetryRequestGuard({
      allowedOrigins: ["https://sqr-system.test"],
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "null",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify(createValidWebVitalsPayload()),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals silently drops non-json telemetry bodies", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: JSON.stringify(createValidWebVitalsPayload()),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals silently drops oversized telemetry bodies before recording", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness({
    webVitalsRequestGuard: createWebVitalsTelemetryRequestGuard({
      maxContentLengthBytes: 128,
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createValidWebVitalsPayload({
        id: `v3-${"oversized".repeat(20)}`,
      })),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals rejects malformed payloads with a validation error", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "INVALID",
        value: -1,
        delta: 0,
        rating: "good",
        id: "",
        path: "login",
        pageType: "public",
        ts: "",
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, "REQUEST_BODY_INVALID");
    assert.equal(recordedPayloads.length, 0);
  } finally {
    await stopTestServer(server);
  }
});
