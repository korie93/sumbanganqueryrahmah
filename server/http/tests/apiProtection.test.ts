import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import {
  createApiProtectionMiddleware,
  isRuntimeProtectedRoute,
  resolveAdaptiveRateLruEvictionKey,
  resolveAdaptiveRateEvictionKey,
  type AdaptiveRateStateStore,
} from "../../internal/apiProtection";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import type { WorkerControlState } from "../../internal/runtime-monitor-manager";

function createControlState(overrides?: Partial<WorkerControlState>): WorkerControlState {
  return {
    mode: "NORMAL",
    healthScore: 100,
    dbProtection: false,
    rejectHeavyRoutes: false,
    throttleFactor: 0.2,
    predictor: {
      requestRateMA: 0,
      latencyMA: 0,
      cpuMA: 0,
      requestRateTrend: 0,
      latencyTrend: 0,
      cpuTrend: 0,
      sustainedUpward: false,
      lastUpdatedAt: null,
    },
    workerCount: 1,
    maxWorkers: 1,
    queueLength: 0,
    preAllocateMB: 0,
    updatedAt: Date.now(),
    workers: [],
    circuits: {
      aiOpenWorkers: 0,
      dbOpenWorkers: 0,
      exportOpenWorkers: 0,
    },
    ...overrides,
  };
}

function createApiProtectionTestApp(options: { adaptiveRateStore?: AdaptiveRateStateStore } = {}) {
  const app = express();
  const { adaptiveRateLimit, systemProtectionMiddleware } = createApiProtectionMiddleware({
    ...(options.adaptiveRateStore ? { adaptiveRateStore: options.adaptiveRateStore } : {}),
    getControlState: () => createControlState(),
    getDbProtection: () => false,
  });

  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = String(req.headers["x-test-userid"] || "").trim();
    if (userId) {
      (req as Request & {
        user?: {
          role: string;
          sessionId: string;
          userId: string;
          username: string;
        };
      }).user = {
        userId,
        username: userId,
        role: "user",
        sessionId: "test-session",
      };
    }
    next();
  });
  app.use(adaptiveRateLimit);
  app.use(systemProtectionMiddleware);

  app.get("/api/noisy", (_req, res) => {
    res.json({ ok: true, route: "noisy" });
  });
  app.get("/api/me", (_req, res) => {
    res.json({ ok: true, route: "me" });
  });
  app.get("/api/auth/me", (_req, res) => {
    res.json({ ok: true, route: "auth-me" });
  });
  app.post("/api/activity/logout", (_req, res) => {
    res.json({ ok: true, route: "logout" });
  });
  app.post("/api/collection", (_req, res) => {
    res.json({ ok: true, route: "collection" });
  });
  app.get("/api/analytics/summary", (_req, res) => {
    res.json({ ok: true, route: "analytics-summary" });
  });
  app.post("/telemetry/web-vitals", (_req, res) => {
    res.json({ ok: true, route: "telemetry" });
  });
  app.post("/api/telemetry/web-vitals", (_req, res) => {
    res.json({ ok: true, route: "telemetry-api" });
  });

  return app;
}

test("adaptive API protection still throttles generic API bursts", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await fetch(`${baseUrl}/api/noisy`);
      assert.equal(response.status, 200);
    }

    const throttled = await fetch(`${baseUrl}/api/noisy`);
    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("ratelimit-limit"), "8");
    assert.equal(throttled.headers.get("ratelimit-remaining"), "0");
    assert.match(throttled.headers.get("ratelimit-reset") ?? "", /^[1-9]\d*$/);
    assert.match(throttled.headers.get("retry-after") ?? "", /^[1-9]\d*$/);
    const payload = await throttled.json();
    assert.equal(payload.message, "Too many requests under current system load.");
    assert.equal(payload.limit, 8);
    assert.equal(payload.mode, "NORMAL");
    assert.equal(typeof payload.retryAfterMs, "number");
    assert.ok(payload.retryAfterMs >= 0);
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection returns RateLimit headers on successful protected responses", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/noisy`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("ratelimit-limit"), "8");
    assert.equal(response.headers.get("ratelimit-remaining"), "7");
    assert.match(response.headers.get("ratelimit-reset") ?? "", /^[1-9]\d*$/);
    assert.equal(response.headers.get("x-ratelimit-limit"), "8");
    assert.equal(response.headers.get("x-ratelimit-remaining"), "7");
    assert.match(response.headers.get("x-ratelimit-reset") ?? "", /^[1-9]\d*$/);
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection does not throttle session control endpoints under load", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await fetch(`${baseUrl}/api/noisy`);
      assert.equal(response.status, 200);
    }

    const noisyOverflow = await fetch(`${baseUrl}/api/noisy`);
    assert.equal(noisyOverflow.status, 429);

    const meResponse = await fetch(`${baseUrl}/api/me`);
    assert.equal(meResponse.status, 200);
    assert.deepEqual(await meResponse.json(), {
      ok: true,
      route: "me",
    });

    const authMeResponse = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(authMeResponse.status, 200);
    assert.deepEqual(await authMeResponse.json(), {
      ok: true,
      route: "auth-me",
    });

    const logoutResponse = await fetch(`${baseUrl}/api/activity/logout`, {
      method: "POST",
    });
    assert.equal(logoutResponse.status, 200);
    assert.deepEqual(await logoutResponse.json(), {
      ok: true,
      route: "logout",
    });
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection isolates collection writes from generic API bursts", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await fetch(`${baseUrl}/api/noisy`);
      assert.equal(response.status, 200);
    }

    const noisyOverflow = await fetch(`${baseUrl}/api/noisy`);
    assert.equal(noisyOverflow.status, 429);

    const collectionResponse = await fetch(`${baseUrl}/api/collection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    assert.equal(collectionResponse.status, 200);
    assert.deepEqual(await collectionResponse.json(), {
      ok: true,
      route: "collection",
    });
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection gives dashboard analytics its own read bucket", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await fetch(`${baseUrl}/api/noisy`);
      assert.equal(response.status, 200);
    }

    const noisyOverflow = await fetch(`${baseUrl}/api/noisy`);
    assert.equal(noisyOverflow.status, 429);

    for (let index = 0; index < 24; index += 1) {
      const analyticsResponse = await fetch(`${baseUrl}/api/analytics/summary`);
      assert.equal(analyticsResponse.status, 200);
    }

    const throttledAnalytics = await fetch(`${baseUrl}/api/analytics/summary`);
    assert.equal(throttledAnalytics.status, 429);
    const payload = await throttledAnalytics.json();
    assert.equal(payload.limit, 24);
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection ignores spoofed x-forwarded-for headers when trust proxy is not enabled", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await fetch(`${baseUrl}/api/noisy`, {
        headers: {
          "x-forwarded-for": `203.0.113.${index + 1}`,
        },
      });
      assert.equal(response.status, 200);
    }

    const throttled = await fetch(`${baseUrl}/api/noisy`, {
      headers: {
        "x-forwarded-for": "198.51.100.77",
      },
    });

    assert.equal(throttled.status, 429);
    const payload = await throttled.json();
    assert.equal(payload.limit, 8);
    assert.equal(payload.mode, "NORMAL");
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection throttles telemetry flood attempts on the canonical API route", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (let index = 0; index < 6; index += 1) {
      const response = await fetch(`${baseUrl}/api/telemetry/web-vitals`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ id: `metric-${index}` }),
      });
      assert.equal(response.status, 200);
    }

    const throttled = await fetch(`${baseUrl}/api/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: "metric-overflow" }),
    });
    assert.equal(throttled.status, 429);
    const payload = await throttled.json();
    assert.equal(payload.message, "Too many requests under current system load.");
    assert.equal(payload.limit, 6);
    assert.equal(payload.mode, "NORMAL");
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection serializes local state under concurrent bursts", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => fetch(`${baseUrl}/api/noisy`)),
    );
    const statusCounts = responses.reduce<Record<number, number>>((counts, response) => {
      counts[response.status] = (counts[response.status] ?? 0) + 1;
      return counts;
    }, {});

    assert.equal(statusCounts[200], 8);
    assert.equal(statusCounts[429], 12);
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection forwards synchronous setup errors to Express error handling", async () => {
  const app = express();
  const { adaptiveRateLimit, stopAdaptiveRateStateSweep } = createApiProtectionMiddleware({
    getControlState: () => {
      throw new Error("control-state-unavailable");
    },
    getDbProtection: () => false,
  });

  app.use(adaptiveRateLimit);
  app.get("/api/noisy", (_req, res) => {
    res.json({ ok: true });
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(599).json({
      message: error instanceof Error ? error.message : "unknown",
    });
  });

  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/noisy`);
    assert.equal(response.status, 599);
    assert.deepEqual(await response.json(), {
      message: "control-state-unavailable",
    });
  } finally {
    stopAdaptiveRateStateSweep();
    await stopTestServer(server);
  }
});

test("adaptive API protection can use a persistent state store", async () => {
  const increments: Array<{
    bucketKey: string;
    staleGraceMs: number;
    windowMs: number;
  }> = [];
  const store: AdaptiveRateStateStore = {
    async increment(options) {
      increments.push({
        bucketKey: options.bucketKey,
        staleGraceMs: options.staleGraceMs,
        windowMs: options.windowMs,
      });
      return {
        count: increments.length,
        lastSeenAt: options.now,
        resetAt: options.now + options.windowMs,
      };
    },
  };
  const app = createApiProtectionTestApp({ adaptiveRateStore: store });
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await fetch(`${baseUrl}/api/noisy`);
      assert.equal(response.status, 200);
    }

    const throttled = await fetch(`${baseUrl}/api/noisy`);
    assert.equal(throttled.status, 429);
    assert.equal(increments.length, 9);
    assert.equal(increments[0].bucketKey.endsWith(":api"), true);
    assert.equal(increments[0].windowMs, 10_000);
    assert.equal(increments[0].staleGraceMs, 10_000);
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection increments per-IP and per-user buckets for authenticated requests", async () => {
  const increments: string[] = [];
  const store: AdaptiveRateStateStore = {
    async increment(options) {
      increments.push(options.bucketKey);
      return {
        count: 1,
        lastSeenAt: options.now,
        resetAt: options.now + options.windowMs,
      };
    },
  };
  const app = createApiProtectionTestApp({ adaptiveRateStore: store });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/noisy`, {
      headers: {
        "x-test-userid": "user-1",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(increments.length, 2);
    assert.equal(increments.some((bucketKey) => bucketKey.startsWith("ip:") && bucketKey.endsWith(":api")), true);
    assert.ok(increments.includes("user:user-1:api"));
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection throttles an authenticated user bucket even when the IP bucket is still below limit", async () => {
  const store: AdaptiveRateStateStore = {
    async increment(options) {
      return {
        count: options.bucketKey.startsWith("user:user-1:api") ? 85 : 1,
        lastSeenAt: options.now,
        resetAt: options.now + options.windowMs,
      };
    },
  };
  const app = createApiProtectionTestApp({ adaptiveRateStore: store });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/noisy`, {
      headers: {
        "x-test-userid": "user-1",
      },
    });

    assert.equal(response.status, 429);
    assert.equal(response.headers.get("ratelimit-limit"), "84");
    assert.equal(response.headers.get("ratelimit-remaining"), "0");
    const payload = await response.json();
    assert.equal(payload.message, "Too many requests under current system load.");
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection keeps different authenticated user buckets independent", async () => {
  const store: AdaptiveRateStateStore = {
    async increment(options) {
      return {
        count: options.bucketKey.startsWith("user:user-1:api") ? 85 : 1,
        lastSeenAt: options.now,
        resetAt: options.now + options.windowMs,
      };
    },
  };
  const app = createApiProtectionTestApp({ adaptiveRateStore: store });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const blockedUser = await fetch(`${baseUrl}/api/noisy`, {
      headers: {
        "x-test-userid": "user-1",
      },
    });
    assert.equal(blockedUser.status, 429);

    const independentUser = await fetch(`${baseUrl}/api/noisy`, {
      headers: {
        "x-test-userid": "user-2",
      },
    });
    assert.equal(independentUser.status, 200);
    assert.equal(independentUser.headers.get("ratelimit-limit"), "8");
    assert.equal(independentUser.headers.get("x-ratelimit-limit"), "8");
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection rejects protected requests when shared state is unavailable", async () => {
  const store: AdaptiveRateStateStore = {
    async increment() {
      return null;
    },
  };
  const app = createApiProtectionTestApp({ adaptiveRateStore: store });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/noisy`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "5");
    assert.deepEqual(await response.json(), {
      message: "Request protection state is temporarily unavailable.",
      protection: true,
      reason: "adaptive_rate_state_unavailable",
    });
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection closes a persistent state store with the sweep cleanup", async () => {
  let closeCalls = 0;
  const store: AdaptiveRateStateStore = {
    async increment() {
      return null;
    },
    close() {
      closeCalls += 1;
    },
  };

  const { stopAdaptiveRateStateSweep } = createApiProtectionMiddleware({
    adaptiveRateStore: store,
    getControlState: () => createControlState(),
    getDbProtection: () => false,
  });

  stopAdaptiveRateStateSweep();
  stopAdaptiveRateStateSweep();
  await Promise.resolve();

  assert.equal(closeCalls, 1);
});

test("runtime protection route classification includes web-vitals telemetry consistently", () => {
  assert.equal(isRuntimeProtectedRoute({ method: "GET", path: "/api/me" }), true);
  assert.equal(isRuntimeProtectedRoute({ method: "POST", path: "/api/telemetry/web-vitals" }), true);
  assert.equal(isRuntimeProtectedRoute({ method: "GET", path: "/api/telemetry/web-vitals" }), true);
  assert.equal(isRuntimeProtectedRoute({ method: "POST", path: "/telemetry/web-vitals" }), true);
  assert.equal(isRuntimeProtectedRoute({ method: "GET", path: "/telemetry/web-vitals" }), false);
  assert.equal(isRuntimeProtectedRoute({ method: "POST", path: "/telemetry" }), false);
  assert.equal(isRuntimeProtectedRoute({ method: "GET", path: "/login" }), false);
});

test("adaptive API protection registers and clears its background sweep interval", (t) => {
  let capturedIntervalMs = 0;
  let unrefCalled = false;
  const fakeHandle = {
    unref() {
      unrefCalled = true;
      return this;
    },
  } as unknown as NodeJS.Timeout;

  const setIntervalMock = t.mock.method(
    globalThis,
    "setInterval",
    (((handler: TimerHandler, delay?: number) => {
      assert.equal(typeof handler, "function");
      capturedIntervalMs = Number(delay ?? 0);
      return fakeHandle;
    }) as unknown) as typeof setInterval,
  );
  const clearIntervalMock = t.mock.method(
    globalThis,
    "clearInterval",
    (((handle?: NodeJS.Timeout) => {
      assert.equal(handle, fakeHandle);
    }) as unknown) as typeof clearInterval,
  );

  const { stopAdaptiveRateStateSweep } = createApiProtectionMiddleware({
    getControlState: () => createControlState(),
    getDbProtection: () => false,
  });

  assert.equal(setIntervalMock.mock.callCount(), 1);
  assert.equal(capturedIntervalMs, 30_000);
  assert.equal(unrefCalled, true);

  stopAdaptiveRateStateSweep();
  stopAdaptiveRateStateSweep();

  assert.equal(clearIntervalMock.mock.callCount(), 1);
});

test("resolveAdaptiveRateEvictionKey evicts the least recently touched bucket instead of relying on Map insertion order", () => {
  const buckets = new Map<string, { count: number; lastSeenAt: number; resetAt: number }>([
    ["attacker-hot", { count: 9, lastSeenAt: 2_000, resetAt: 12_000 }],
    ["legit-old", { count: 1, lastSeenAt: 1_000, resetAt: 11_000 }],
    ["attacker-new", { count: 2, lastSeenAt: 3_000, resetAt: 13_000 }],
  ]);

  assert.equal(resolveAdaptiveRateEvictionKey(buckets), "legit-old");
});

test("resolveAdaptiveRateLruEvictionKey uses Map touch order for constant-time production eviction", () => {
  const buckets = new Map<string, { count: number; lastSeenAt: number; resetAt: number }>([
    ["legit-old", { count: 1, lastSeenAt: 1_000, resetAt: 11_000 }],
    ["attacker-hot", { count: 9, lastSeenAt: 2_000, resetAt: 12_000 }],
    ["attacker-new", { count: 2, lastSeenAt: 3_000, resetAt: 13_000 }],
  ]);

  const hotBucket = buckets.get("legit-old");
  assert.ok(hotBucket);
  buckets.delete("legit-old");
  buckets.set("legit-old", {
    ...hotBucket,
    lastSeenAt: 4_000,
  });

  assert.equal(resolveAdaptiveRateLruEvictionKey(buckets), "attacker-hot");
});
