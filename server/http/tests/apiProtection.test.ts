import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createApiProtectionMiddleware,
  resolveAdaptiveRateEvictionKey,
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

function createApiProtectionTestApp() {
  const app = express();
  const { adaptiveRateLimit, systemProtectionMiddleware } = createApiProtectionMiddleware({
    getControlState: () => createControlState(),
    getDbProtection: () => false,
  });

  app.use(express.json());
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
  app.get("/api/backups", (_req, res) => {
    res.json({ ok: true, route: "backup-list" });
  });
  app.post("/api/backups", (_req, res) => {
    res.status(202).json({ ok: true, route: "backup-create" });
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

test("adaptive API protection does not let generic API bursts consume the backup create write bucket", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await fetch(`${baseUrl}/api/noisy`);
      assert.equal(response.status, 200);
    }

    const noisyOverflow = await fetch(`${baseUrl}/api/noisy`);
    assert.equal(noisyOverflow.status, 429);

    const backupCreate = await fetch(`${baseUrl}/api/backups`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Smoke backup" }),
    });

    assert.equal(backupCreate.status, 202);
    assert.deepEqual(await backupCreate.json(), {
      ok: true,
      route: "backup-create",
    });
  } finally {
    await stopTestServer(server);
  }
});

test("adaptive API protection still throttles repeated backup create writes within their own bucket", async () => {
  const app = createApiProtectionTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (let index = 0; index < 2; index += 1) {
      const response = await fetch(`${baseUrl}/api/backups`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: `Backup ${index}` }),
      });
      assert.equal(response.status, 202);
    }

    const throttled = await fetch(`${baseUrl}/api/backups`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Backup overflow" }),
    });

    assert.equal(throttled.status, 429);
    const payload = await throttled.json();
    assert.equal(payload.limit, 2);
    assert.equal(payload.mode, "NORMAL");
  } finally {
    await stopTestServer(server);
  }
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
