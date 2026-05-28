import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { Request } from "express";
import { ERROR_CODES } from "../../../shared/error-codes";
import { getInternalMetricsSnapshot } from "../../internal/metrics";
import { logger } from "../../lib/logger";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import {
  buildAuthRouteRateLimitSubject,
  buildRequestRateLimitFingerprint,
  clearAdaptiveRateLimitCooldownsForTests,
  createImportsUploadRateLimiter,
  createAuthRouteRateLimiters,
  getAdaptiveRateLimitCachePressureTier,
  getAdaptiveRateLimitCooldownStats,
  getAdaptiveRateLimitCooldownKeysForTests,
  normalizeAuthRateLimitIdentifier,
  performAdaptiveRateLimitCachePressureEvictionForTests,
  pruneAdaptiveRateLimitCooldowns,
  recordAdaptiveRateLimitViolationForTests,
  startAdaptiveRateLimitCooldownSweep,
  stopAdaptiveRateLimitCooldownSweep,
} from "../rate-limit";

function createRequest(
  headers: Record<string, string | undefined> = {},
  ip = "203.0.113.10",
  body: Record<string, unknown> | undefined = undefined,
) {
  return {
    ip,
    body,
    socket: {
      remoteAddress: "10.0.0.10",
    },
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Request;
}

test("buildRequestRateLimitFingerprint keeps the network identity and normalized client hints", () => {
  const req = createRequest({
    "user-agent": " Mozilla/5.0  ",
    "accept-language": " en-US,en;q=0.9 ",
  });

  assert.deepEqual(buildRequestRateLimitFingerprint(req), [
    "203.0.113.10",
    "peer:10.0.0.10",
    "ua:mozilla/5.0",
    "lang:en-us,en;q=0.9",
  ]);
});

test("buildRequestRateLimitFingerprint omits empty headers safely", () => {
  const req = createRequest({
    "user-agent": "   ",
    "accept-language": undefined,
  }, "198.51.100.8");

  assert.deepEqual(buildRequestRateLimitFingerprint(req), [
    "198.51.100.8",
    "peer:10.0.0.10",
  ]);
});

test("buildRequestRateLimitFingerprint avoids duplicating the direct peer when it matches req.ip", () => {
  const req = {
    ip: "198.51.100.8",
    socket: {
      remoteAddress: "198.51.100.8",
    },
    get() {
      return undefined;
    },
  } as unknown as Request;

  assert.deepEqual(buildRequestRateLimitFingerprint(req), ["198.51.100.8"]);
});

test("normalizeAuthRateLimitIdentifier trims and lowercases supported identifiers", () => {
  assert.equal(normalizeAuthRateLimitIdentifier(" Admin.User "), "admin.user");
  assert.equal(normalizeAuthRateLimitIdentifier(""), null);
  assert.equal(normalizeAuthRateLimitIdentifier(123), null);
});

test("buildAuthRouteRateLimitSubject keeps auth identifiers stable across casing and field aliases", () => {
  const fromUsername = createRequest({}, "203.0.113.10", {
    username: " Admin.User ",
  });
  const fromIdentifier = createRequest({}, "203.0.113.10", {
    identifier: "admin.user",
  });
  const fromEmail = createRequest({}, "203.0.113.10", {
    email: " ADMIN.USER ",
  });

  assert.equal(
    buildAuthRouteRateLimitSubject(fromUsername, "auth-login"),
    buildAuthRouteRateLimitSubject(fromIdentifier, "auth-login"),
  );
  assert.equal(
    buildAuthRouteRateLimitSubject(fromIdentifier, "auth-recovery:/api/auth/request-password-reset"),
    buildAuthRouteRateLimitSubject(fromEmail, "auth-recovery:/api/auth/request-password-reset"),
  );
});

test("buildAuthRouteRateLimitSubject ignores malformed request bodies safely", () => {
  const malformed = createRequest({}, "203.0.113.10", {
    username: 42,
  });

  assert.equal(buildAuthRouteRateLimitSubject(malformed, "auth-login"), null);
});

test("createImportsUploadRateLimiter throttles repeated upload attempts from the same network", async () => {
  const app = express();
  app.post(
    "/upload",
    createImportsUploadRateLimiter({
      windowMs: 60_000,
      max: 1,
    }),
    (_req, res) => {
      res.status(204).end();
    },
  );

  const { baseUrl, server } = await startTestServer(app);

  try {
    const firstResponse = await fetch(`${baseUrl}/upload`, {
      method: "POST",
    });
    const secondResponse = await fetch(`${baseUrl}/upload`, {
      method: "POST",
    });

    assert.equal(firstResponse.status, 204);
    assert.equal(secondResponse.status, 429);
    assert.equal(secondResponse.headers.get("ratelimit-limit"), "1");
    assert.equal(secondResponse.headers.get("ratelimit-remaining"), "0");
    assert.match(secondResponse.headers.get("ratelimit-reset") ?? "", /^[1-9]\d*$/);
    assert.match(secondResponse.headers.get("retry-after") ?? "", /^[1-9]\d*$/);
    const payload = await secondResponse.json();
    assert.equal(typeof payload.retryAfterMs, "number");
    assert.ok(payload.retryAfterMs >= 0);
    assert.deepEqual(payload.error, {
      code: ERROR_CODES.IMPORT_UPLOAD_RATE_LIMITED,
      message: "Too many import upload attempts from this network. Please wait before trying again.",
    });
    assert.equal(payload.ok, false);
  } finally {
    await stopTestServer(server);
  }
});

test("auth adaptive cooldown sweep is unrefed and stops idempotently", (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  let capturedDelay = 0;
  let unrefCalled = false;
  const fakeHandle = {
    unref() {
      unrefCalled = true;
      return this;
    },
  } as unknown as ReturnType<typeof setInterval>;

  const setIntervalMock = t.mock.method(
    globalThis,
    "setInterval",
    (((handler: TimerHandler, delay?: number) => {
      assert.equal(typeof handler, "function");
      capturedDelay = Number(delay ?? 0);
      return fakeHandle;
    }) as unknown) as typeof setInterval,
  );
  const clearIntervalMock = t.mock.method(
    globalThis,
    "clearInterval",
    (((handle?: ReturnType<typeof setInterval>) => {
      assert.equal(handle, fakeHandle);
    }) as unknown) as typeof clearInterval,
  );

  startAdaptiveRateLimitCooldownSweep();

  assert.equal(setIntervalMock.mock.callCount(), 1);
  assert.equal(capturedDelay, 30_000);
  assert.equal(unrefCalled, true);
  assert.deepEqual(getAdaptiveRateLimitCooldownStats(), {
    bucketCount: 0,
    sweepActive: true,
  });

  stopAdaptiveRateLimitCooldownSweep();
  stopAdaptiveRateLimitCooldownSweep();

  assert.equal(clearIntervalMock.mock.callCount(), 1);
});

test("auth adaptive cooldown sweep startup is singleton and prune is safe on empty state", (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  const fakeHandle = {
    unref() {
      return this;
    },
  } as unknown as ReturnType<typeof setInterval>;
  const setIntervalMock = t.mock.method(
    globalThis,
    "setInterval",
    (((_handler: TimerHandler) => fakeHandle) as unknown) as typeof setInterval,
  );

  startAdaptiveRateLimitCooldownSweep();
  startAdaptiveRateLimitCooldownSweep();

  assert.equal(setIntervalMock.mock.callCount(), 1);
  assert.equal(pruneAdaptiveRateLimitCooldowns(Date.now()), 0);

  stopAdaptiveRateLimitCooldownSweep();
});

test("auth adaptive cooldown records violations without hot-path full pruning", async () => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  const app = express();
  app.use(express.json());
  const limiters = createAuthRouteRateLimiters();
  app.post("/login", limiters.login, (_req, res) => {
    res.status(204).end();
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin.user" }),
      });
      assert.equal(response.status, 204);
    }

    const throttled = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin.user" }),
    });

    assert.equal(throttled.status, 429);
    assert.equal(getAdaptiveRateLimitCooldownStats().bucketCount, 1);
    assert.equal(pruneAdaptiveRateLimitCooldowns(Date.now() + (15 * 60 * 1000) + 1), 1);
    assert.equal(getAdaptiveRateLimitCooldownStats().bucketCount, 0);
  } finally {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(server);
  }
});

test("auth login IP limiter throttles after five attempts even when identifiers rotate", async () => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  const app = express();
  app.use(express.json());
  const limiters = createAuthRouteRateLimiters();
  app.post("/login", limiters.loginIp, (_req, res) => {
    res.status(204).end();
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: `rotating-user-${index}` }),
      });
      assert.equal(response.status, 204);
    }

    const throttled = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "fresh-identifier" }),
    });

    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("ratelimit-limit"), "5");
    assert.equal(getAdaptiveRateLimitCooldownStats().bucketCount, 1);
  } finally {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(server);
  }
});

test("auth adaptive cooldown pressure tiers match cache utilization thresholds", () => {
  assert.equal(getAdaptiveRateLimitCachePressureTier(0, 100), "NORMAL");
  assert.equal(getAdaptiveRateLimitCachePressureTier(70, 100), "NORMAL");
  assert.equal(getAdaptiveRateLimitCachePressureTier(86, 100), "WARNING");
  assert.equal(getAdaptiveRateLimitCachePressureTier(96, 100), "CRITICAL");
  assert.equal(getAdaptiveRateLimitCachePressureTier(100, 100), "EMERGENCY");
  assert.equal(getAdaptiveRateLimitCachePressureTier(1, 0), "EMERGENCY");
});

test("auth adaptive cooldown warning eviction removes expired entries only", (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();
  t.mock.method(logger, "warn", () => undefined);

  try {
    recordAdaptiveRateLimitViolationForTests("expired-client", 1, 1_000);
    recordAdaptiveRateLimitViolationForTests("active-client", 60_000, 1_000);

    const result = performAdaptiveRateLimitCachePressureEvictionForTests("WARNING", 1_010);
    const keys = getAdaptiveRateLimitCooldownKeysForTests();

    assert.equal(result.tier, "WARNING");
    assert.equal(result.evictedCount, 1);
    assert.equal(keys.includes("expired-client"), false);
    assert.equal(keys.includes("active-client"), true);
  } finally {
    clearAdaptiveRateLimitCooldownsForTests();
  }
});

test("auth adaptive cooldown critical eviction removes oldest bounded slice", (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();
  t.mock.method(logger, "warn", () => undefined);

  try {
    const startedAt = Date.now();
    for (let index = 0; index < 10; index += 1) {
      recordAdaptiveRateLimitViolationForTests(`client-${index}`, 60_000, startedAt + index);
    }

    const result = performAdaptiveRateLimitCachePressureEvictionForTests("CRITICAL", startedAt + 10);

    const keys = getAdaptiveRateLimitCooldownKeysForTests();
    assert.equal(result.evictedCount, 2);
    assert.equal(keys.length, 8);
    assert.equal(keys.includes("client-0"), false);
    assert.equal(keys.includes("client-1"), false);
    assert.equal(keys.includes("client-9"), true);
  } finally {
    clearAdaptiveRateLimitCooldownsForTests();
  }
});

test("auth adaptive cooldown emergency eviction records metrics and accepts new entries", (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();
  t.mock.method(logger, "error", () => undefined);
  t.mock.method(logger, "warn", () => undefined);

  try {
    const startedAt = Date.now();
    const metricBefore = getInternalMetricsSnapshot()
      .counters.authAdaptiveRateLimitCooldownEvictionsTotal;
    for (let index = 0; index < 10; index += 1) {
      recordAdaptiveRateLimitViolationForTests(`emergency-client-${index}`, 60_000, startedAt + index);
    }

    const result = performAdaptiveRateLimitCachePressureEvictionForTests("EMERGENCY", startedAt + 10);
    recordAdaptiveRateLimitViolationForTests("emergency-client-new", 60_000, startedAt + 11);
    const metricAfter = getInternalMetricsSnapshot()
      .counters.authAdaptiveRateLimitCooldownEvictionsTotal;
    const keys = getAdaptiveRateLimitCooldownKeysForTests();

    assert.equal(result.evictedCount, 5);
    assert.equal(metricAfter - metricBefore, 5);
    assert.equal(keys.length, 6);
    assert.equal(keys.includes("emergency-client-new"), true);
  } finally {
    clearAdaptiveRateLimitCooldownsForTests();
  }
});

test("auth adaptive cooldown hard cap stays bounded across sustained inserts", (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();
  t.mock.method(logger, "warn", () => undefined);

  try {
    const startedAt = Date.now();
    for (let index = 0; index < 50_001; index += 1) {
      recordAdaptiveRateLimitViolationForTests(`sustained-client-${index}`, 60_000, startedAt + index);
    }

    const keys = getAdaptiveRateLimitCooldownKeysForTests();
    assert.ok(getAdaptiveRateLimitCooldownStats().bucketCount <= 4_096);
    assert.equal(keys.length, getAdaptiveRateLimitCooldownStats().bucketCount);
    assert.equal(keys.includes("sustained-client-0"), false);
    assert.equal(keys.includes("sustained-client-50000"), true);
  } finally {
    clearAdaptiveRateLimitCooldownsForTests();
  }
});

test("auth adaptive cooldown cache pressure emits bounded observability", (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  const warningLogs: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  const metricBefore = getInternalMetricsSnapshot()
    .counters.authAdaptiveRateLimitCooldownCachePressureTotal;
  t.mock.method(logger, "warn", (message: string, payload?: Record<string, unknown>) => {
    warningLogs.push({ message, payload });
  });

  try {
    const nowMs = Date.parse("2026-05-28T00:00:00.000Z");
    const pressureThresholdEntries = Math.ceil(4_096 * 0.85);
    for (let index = 0; index < pressureThresholdEntries; index += 1) {
      recordAdaptiveRateLimitViolationForTests(`pressure-client-${index}`, 60_000, nowMs);
    }

    const metricAfter = getInternalMetricsSnapshot()
      .counters.authAdaptiveRateLimitCooldownCachePressureTotal;
    assert.equal(metricAfter - metricBefore, 1);
    assert.equal(warningLogs.length, 1);
    assert.deepEqual(warningLogs[0], {
      message: "Auth adaptive rate-limit cooldown cache pressure detected",
      payload: {
        bucketCount: pressureThresholdEntries,
        maxBuckets: 4_096,
        thresholdPercent: 85,
        utilizationPercent: 85,
      },
    });
  } finally {
    clearAdaptiveRateLimitCooldownsForTests();
  }
});

test("auth two-factor login limiter throttles repeated authenticator attempts independently", async () => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  const app = express();
  app.use(express.json());
  const limiters = createAuthRouteRateLimiters();
  app.post("/verify-two-factor-login", limiters.twoFactorLogin, (_req, res) => {
    res.status(204).end();
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${baseUrl}/verify-two-factor-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: "redacted", code: "123456" }),
      });
      assert.equal(response.status, 204);
    }

    const throttled = await fetch(`${baseUrl}/verify-two-factor-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken: "redacted", code: "123456" }),
    });

    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("ratelimit-limit"), "5");
    assert.equal(getAdaptiveRateLimitCooldownStats().bucketCount, 1);
  } finally {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(server);
  }
});
