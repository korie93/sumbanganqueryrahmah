import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { Request } from "express";
import { ERROR_CODES } from "../../../shared/error-codes";
import { runtimeConfig } from "../../config/runtime";
import { createCsrfProtectionMiddleware } from "../../http/csrf";
import { createApiProtectionMiddleware } from "../../internal/apiProtection";
import { getInternalMetricsSnapshot } from "../../internal/metrics";
import { logger } from "../../lib/logger";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { RedisRateLimitStore, RedisRateLimitStoreUnavailableError } from "../redis-rate-limit-store";
import {
  buildAuthRouteRateLimitSubject,
  buildLoginAccountRateLimitKey,
  buildLoginNetworkRateLimitKey,
  buildRequestRateLimitFingerprint,
  buildSearchRateLimitKey,
  clearAdaptiveRateLimitCooldownsForTests,
  createImportsUploadRateLimiter,
  createAuthRouteRateLimiters,
  getAdaptiveRateLimitCachePressureTier,
  getAdaptiveRateLimitCooldownStats,
  getAdaptiveRateLimitCooldownKeysForTests,
  getAdaptiveRateLimitCooldownShardSizesForTests,
  normalizeAuthRateLimitIdentifier,
  performAdaptiveRateLimitCachePressureEvictionForTests,
  pruneAdaptiveRateLimitCooldowns,
  recordAdaptiveRateLimitViolationForTests,
  searchRateLimiter,
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

test("login account keys use the canonical username without IP or client-hint bypasses", () => {
  const first = createRequest({ "user-agent": "Browser A" }, "203.0.113.10", {
    username: " ADMIN.User ", identifier: "decoy-a", email: "decoy-a@example.test",
  });
  const rotated = createRequest({ "user-agent": "Browser B" }, "198.51.100.20", {
    username: "admin.user", identifier: "decoy-b", email: "decoy-b@example.test",
  });
  assert.equal(buildLoginAccountRateLimitKey(first), buildLoginAccountRateLimitKey(rotated));
  assert.equal(
    buildLoginAccountRateLimitKey(first),
    buildLoginAccountRateLimitKey(createRequest({}, "198.51.100.20", { username: "ＡＤＭＩＮ.User" })),
  );
  assert.notEqual(
    buildLoginAccountRateLimitKey(first),
    buildLoginAccountRateLimitKey(createRequest({}, "203.0.113.10", { username: "another.user" })),
  );
  assert.match(buildLoginAccountRateLimitKey(first), /^auth-login\|acct:[a-f0-9]{24}$/);
  assert.equal(buildLoginAccountRateLimitKey(first).includes("admin.user"), false);
});

test("login network keys ignore spoofed headers and normalize IPv4 and IPv6 networks", () => {
  const first = createRequest({ "user-agent": "Browser A" }, "203.0.113.10");
  const rotated = createRequest({
    "user-agent": "Browser B", "accept-language": "different", "x-forwarded-for": "198.51.100.20",
  }, "::ffff:203.0.113.10");
  assert.equal(buildLoginNetworkRateLimitKey(first), buildLoginNetworkRateLimitKey(rotated));
  assert.equal(
    buildLoginNetworkRateLimitKey(createRequest({}, "2001:db8:1234:5600::1")),
    buildLoginNetworkRateLimitKey(createRequest({}, "2001:db8:1234:56ff::2")),
  );
  assert.notEqual(
    buildLoginNetworkRateLimitKey(first),
    buildLoginNetworkRateLimitKey(createRequest({}, "198.51.100.20")),
  );
});

test("malformed login subjects share a bounded network fallback, not arbitrary decoy accounts", () => {
  const malformed = createRequest({}, "203.0.113.10", { username: 42, identifier: "decoy-a" });
  const missing = createRequest({}, "203.0.113.10", { identifier: "decoy-b" });
  assert.equal(buildLoginAccountRateLimitKey(malformed), buildLoginAccountRateLimitKey(missing));
  assert.match(buildLoginAccountRateLimitKey(malformed), /^auth-login\|invalid:auth-login-ip\|ip:/);
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

test("search limiter allows 30 authenticated office users sharing one trusted-proxy IP", async () => {
  const app = express();
  app.set("trust proxy", "loopback");
  for (let index = 0; index < 30; index += 1) {
    app.get(`/search/${index}`, (req, _res, next) => {
      // Server-side auth fixture: never take a quota identity from request hints.
      (req as Request & { user: { userId: string } }).user = { userId: `search-office-${index}` };
      next();
    }, searchRateLimiter, (_req, res) => res.status(204).end());
  }
  const { baseUrl, server } = await startTestServer(app);

  try {
    const statuses = await Promise.all(Array.from({ length: 30 }, async (_unused, index) => {
      const response = await fetch(`${baseUrl}/search/${index}`, {
        headers: { "X-Forwarded-For": "203.0.113.42" },
      });
      await response.arrayBuffer();
      return response.status;
    }));
    assert.deepEqual(statuses, Array.from({ length: 30 }, () => 204));
  } finally {
    await stopTestServer(server);
  }
});

test("search keys hash only the authenticated user and normalize the anonymous IP fallback", () => {
  const first = createRequest({}, "203.0.113.43");
  const rotated = createRequest({ "user-agent": "Different browser" }, "198.51.100.43");
  for (const req of [first, rotated]) {
    (req as Request & { user: { userId: string } }).user = { userId: "search-private-user" };
  }
  assert.equal(buildSearchRateLimitKey(first), buildSearchRateLimitKey(rotated));
  assert.match(buildSearchRateLimitKey(first), /^search:user-v1:[a-f0-9]{64}$/);
  assert.equal(buildSearchRateLimitKey(first).includes("search-private-user"), false);

  const anonymous = createRequest({}, "203.0.113.43");
  const spoofed = createRequest({
    "x-user-id": "search-private-user", "x-forwarded-for": "198.51.100.43",
    authorization: "Bearer client-controlled-token",
  }, "::ffff:203.0.113.43", { userId: "search-private-user", user: { userId: "search-private-user" } });
  (spoofed as Request & { user: { userId: string } }).user = { userId: " " };
  spoofed.query = { userId: "search-private-user" };
  assert.equal(buildSearchRateLimitKey(anonymous), buildSearchRateLimitKey(spoofed));
  assert.notEqual(buildSearchRateLimitKey(first), buildSearchRateLimitKey(anonymous));
  assert.equal(
    buildSearchRateLimitKey(createRequest({}, "2001:db8:1234:5600::1")),
    buildSearchRateLimitKey(createRequest({}, "2001:db8:1234:56ff::2")),
  );
});

test("search abuse stays capped at 10 per user across IP and route changes without blocking a colleague", async () => {
  const app = express();
  app.set("trust proxy", "loopback");
  for (const [path, userId] of [
    ["/search", "search-abusive-user"],
    ["/source-match", "search-abusive-user"],
    ["/colleague", "search-healthy-colleague"],
  ]) {
    app.get(path, (req, _res, next) => {
      (req as Request & { user: { userId: string } }).user = { userId };
      next();
    }, searchRateLimiter, (_req, res) => res.status(204).end());
  }
  const { baseUrl, server } = await startTestServer(app);

  try {
    for (let index = 0; index <= 10; index += 1) {
      const response = await fetch(`${baseUrl}${index % 2 ? "/source-match" : "/search"}`, {
        headers: { "X-Forwarded-For": `198.51.100.${index + 50}`, "User-Agent": `Browser ${index}` },
      });
      assert.equal(response.status, index < 10 ? 204 : 429);
      if (index === 10) {
        assert.equal(response.headers.get("ratelimit-limit"), "10");
        assert.equal(response.headers.get("ratelimit-remaining"), "0");
        assert.match(response.headers.get("retry-after") ?? "", /^[1-9]\d*$/);
        assert.equal((await response.json()).error.code, ERROR_CODES.SEARCH_RATE_LIMITED);
      }
    }
    const colleague = await fetch(`${baseUrl}/colleague`, {
      headers: { "X-Forwarded-For": "198.51.100.60" },
    });
    assert.equal(colleague.status, 204);
  } finally {
    await stopTestServer(server);
  }
});

test("anonymous search fallback stays IP limited despite spoofed identity and forwarding headers", async () => {
  const app = express();
  // A direct client cannot move its quota using an untrusted forwarding header.
  app.set("trust proxy", false);
  app.use(express.json());
  app.post("/search", searchRateLimiter, (_req, res) => res.status(204).end());
  const { baseUrl, server } = await startTestServer(app);

  try {
    for (let index = 0; index <= 10; index += 1) {
      const response = await fetch(`${baseUrl}/search?userId=spoof-${index}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", "X-Forwarded-For": `198.51.100.${index + 80}`,
          "X-User-Id": `spoof-${index}`, authorization: `Bearer unverified-${index}`,
        },
        body: JSON.stringify({ userId: `spoof-${index}`, user: { userId: `spoof-${index}` } }),
      });
      assert.equal(response.status, index < 10 ? 204 : 429);
      if (index === 10) assert.equal(response.headers.get("ratelimit-limit"), "10");
    }
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

test("auth adaptive cooldown sweep and pressure eviction stay synchronous", () => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  try {
    recordAdaptiveRateLimitViolationForTests("expired-client", 1_000, 1_000);
    recordAdaptiveRateLimitViolationForTests("active-client", 60_000, 1_000);

    const pruned = pruneAdaptiveRateLimitCooldowns(2_010);
    assert.equal(typeof pruned, "number");
    assert.equal(pruned, 1);

    const eviction = performAdaptiveRateLimitCachePressureEvictionForTests("NORMAL", 1_011);
    assert.equal(eviction instanceof Promise, false);
    assert.equal(eviction.evictedCount, 0);

    recordAdaptiveRateLimitViolationForTests("request-after-sweep", 60_000, 1_012);
    const keys = getAdaptiveRateLimitCooldownKeysForTests();
    assert.deepEqual(new Set(keys), new Set(["active-client", "request-after-sweep"]));
  } finally {
    clearAdaptiveRateLimitCooldownsForTests();
  }
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

test("auth login allows 100 legitimate staff accounts on one NAT with identical browser hints", async () => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  const app = express();
  app.use(express.json());
  const limiters = createAuthRouteRateLimiters();
  app.post("/login", limiters.loginIp, limiters.login, (_req, res) => {
    res.status(204).end();
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const responses = await Promise.all(Array.from({ length: 100 }, (_, index) => fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Office Browser", "Accept-Language": "en-US" },
      body: JSON.stringify({ username: `staff-${index}` }),
    })));
    assert.deepEqual(responses.map((response) => response.status), Array(100).fill(204));
    assert.equal(getAdaptiveRateLimitCooldownStats().bucketCount, 0);
  } finally {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(server);
  }
});

test("combined CSRF, adaptive protection, and canonical/legacy login guards allow 100 shared-NAT staff", async (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();
  t.mock.method(logger, "info", () => undefined);
  t.mock.method(logger, "warn", () => undefined);
  const app = express();
  app.set("trust proxy", "loopback");
  app.use(express.json());
  app.use(createCsrfProtectionMiddleware());
  const protection = createApiProtectionMiddleware({
    getDbProtection: () => false,
    getControlState: () => ({
      mode: "PROTECTION", healthScore: 50, dbProtection: false, rejectHeavyRoutes: true,
      throttleFactor: 0.2, workerCount: 1, maxWorkers: 1, queueLength: 0, preAllocateMB: 0,
      updatedAt: Date.now(), workers: [], circuits: { aiOpenWorkers: 0, dbOpenWorkers: 0, exportOpenWorkers: 0 },
      predictor: {
        requestRateMA: 0, latencyMA: 0, cpuMA: 0, requestRateTrend: 0, latencyTrend: 0,
        cpuTrend: 0, sustainedUpward: false, lastUpdatedAt: null,
      },
    }),
  });
  app.use(protection.adaptiveRateLimit);
  app.use(protection.systemProtectionMiddleware);
  const limiters = createAuthRouteRateLimiters();
  for (const path of ["/api/login", "/api/auth/login"]) {
    app.post(path, limiters.loginIp, limiters.login, (_req, res) => res.status(204).end());
  }
  const { baseUrl, server } = await startTestServer(app);
  const csrfToken = "a".repeat(64);
  const loginHeaders = {
    "Content-Type": "application/json", "User-Agent": "Office Browser", "Accept-Language": "en-US",
    "X-Forwarded-For": "203.0.113.20", Cookie: `sqr_auth=stale-session; sqr_csrf=${csrfToken}`,
    "X-CSRF-Token": csrfToken,
  };
  try {
    const denied = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: loginHeaders.Cookie },
      body: JSON.stringify({ username: "denied.csrf" }),
    });
    assert.equal(denied.status, 403);
    const responses = await Promise.all(Array.from({ length: 100 }, (_, index) => fetch(
      `${baseUrl}${index % 2 ? "/api/login" : "/api/auth/login"}`,
      { method: "POST", headers: loginHeaders, body: JSON.stringify({ username: `combined-staff-${index}` }) },
    )));
    assert.ok(responses.every((response) => response.status === 204));
    for (let index = 0; index < 6; index += 1) {
      const response = await fetch(`${baseUrl}${index % 2 ? "/api/login" : "/api/auth/login"}`, {
        method: "POST", headers: loginHeaders, body: JSON.stringify({ username: "combined-abuser" }),
      });
      assert.equal(response.status, index < 5 ? 204 : 429);
    }
    const healthy = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: loginHeaders, body: JSON.stringify({ username: "healthy-after-abuse" }),
    });
    assert.equal(healthy.status, 204);
  } finally {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(server);
  }
});

test("auth login network flood guard blocks its configured capacity despite rotating accounts and browser hints", async (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();
  const warningLogs: Array<Record<string, unknown> | undefined> = [];
  t.mock.method(logger, "warn", (_message: string, payload?: Record<string, unknown>) => warningLogs.push(payload));
  const app = express();
  app.use(express.json());
  const limiters = createAuthRouteRateLimiters();
  app.post("/login", limiters.loginIp, limiters.login, (_req, res) => res.status(204).end());
  const { baseUrl, server } = await startTestServer(app);

  try {
    const networkMax = runtimeConfig.rateLimiting.loginIpAttemptsPer15Minutes;
    for (let offset = 0; offset < networkMax; offset += 100) {
      const responses = await Promise.all(Array.from({ length: Math.min(100, networkMax - offset) }, (_, index) => {
        const subject = offset + index;
        return fetch(`${baseUrl}/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json", "User-Agent": `Rotated Browser ${subject}`,
            "Accept-Language": `rotated-${subject}`, "X-Forwarded-For": `198.51.100.${subject % 250 + 1}`,
          },
          body: JSON.stringify({ username: `flood-${subject}` }),
        });
      }));
      assert.ok(responses.every((response) => response.status === 204));
    }

    const throttled = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "fresh-identifier" }),
    });

    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("ratelimit-limit"), String(networkMax));
    assert.match(throttled.headers.get("retry-after") ?? "", /^[1-9]\d*$/);
    assert.equal((await throttled.json()).error.code, ERROR_CODES.AUTH_RATE_LIMITED);
    assert.equal(getAdaptiveRateLimitCooldownStats().bucketCount, 1);
    const violation = warningLogs.find((entry) => entry?.limiter === "login-ip-aggregate-limit");
    assert.equal(violation?.subjectType, "ip");
    assert.equal(violation?.count, networkMax + 1);
    assert.equal(violation?.limit, networkMax);
    assert.match(String(violation?.subjectHash), /^[a-f0-9]{24}$/);
    assert.equal(JSON.stringify(violation).includes("fresh-identifier"), false);
  } finally {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(server);
  }
});

test("auth login account brute force remains strict across IP rotation without locking other staff", async (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();
  const warningLogs: Array<Record<string, unknown> | undefined> = [];
  t.mock.method(logger, "warn", (_message: string, payload?: Record<string, unknown>) => warningLogs.push(payload));
  const app = express();
  // Test requests come through a loopback proxy, matching the production trust boundary.
  app.set("trust proxy", "loopback");
  app.use(express.json());
  const limiters = createAuthRouteRateLimiters();
  app.post("/login", limiters.loginIp, limiters.login, (_req, res) => res.status(401).end());
  const { baseUrl, server } = await startTestServer(app);

  try {
    for (let index = 0; index < 6; index += 1) {
      const response = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", "User-Agent": `Rotated Browser ${index}`,
          "X-Forwarded-For": `198.51.100.${index + 1}`,
        },
        body: JSON.stringify({
          username: index === 5 ? "ＴＡＲＧＥＴ.User" : index % 2 ? " TARGET.User " : "target.user",
          identifier: `decoy-${index}`,
        }),
      });
      assert.equal(response.status, index < 5 ? 401 : 429);
      if (index === 5) {
        assert.equal(response.headers.get("ratelimit-limit"), "5");
        assert.match(response.headers.get("retry-after") ?? "", /^[1-9]\d*$/);
      }
    }
    const otherStaff = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.6" },
      body: JSON.stringify({ username: "unrelated.staff" }),
    });
    assert.equal(otherStaff.status, 401);
    const cooldown = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.200" },
      body: JSON.stringify({ username: "target.user" }),
    });
    assert.equal(cooldown.status, 429);
    assert.equal(warningLogs.filter((entry) => entry?.limiter === "login-account-limit").length, 2);
    assert.equal(JSON.stringify(warningLogs).includes("target.user"), false);
    assert.equal(getAdaptiveRateLimitCooldownStats().bucketCount, 1);
  } finally {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(server);
  }
});

test("configured Redis outages fail closed for login and expensive routes with safe retry guidance", async (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();
  const originalProvider = runtimeConfig.rateLimiting.store.provider;
  runtimeConfig.rateLimiting.store.provider = "redis";
  t.after(() => { runtimeConfig.rateLimiting.store.provider = originalProvider; });
  t.mock.method(RedisRateLimitStore.prototype, "increment", async () => {
    throw new RedisRateLimitStoreUnavailableError();
  });
  const app = express();
  app.use(express.json());
  const limiters = createAuthRouteRateLimiters();
  let successfulHandlers = 0;
  app.post("/login", limiters.loginIp, limiters.login, (_req, res) => {
    successfulHandlers += 1;
    res.status(204).end();
  });
  app.post("/upload", createImportsUploadRateLimiter(), (_req, res) => {
    successfulHandlers += 1;
    res.status(204).end();
  });
  const { baseUrl, server } = await startTestServer(app);

  try {
    for (const path of ["/login", "/upload"]) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "protected.user" }),
      });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("retry-after"), "5");
      const payload = await response.json();
      assert.equal(payload.ok, false);
      assert.equal(payload.error.code, ERROR_CODES.SERVICE_UNAVAILABLE);
      assert.equal(payload.retryAfterMs, 5_000);
      assert.equal(JSON.stringify(payload).includes("protected.user"), false);
    }
    assert.equal(successfulHandlers, 0);
    assert.equal(getAdaptiveRateLimitCooldownStats().bucketCount, 0);
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
    // Use logical time: a real 1 ms LRU TTL can expire before the sweep on busy CI.
    recordAdaptiveRateLimitViolationForTests("expired-client", 1_000, 1_000);
    recordAdaptiveRateLimitViolationForTests("active-client", 60_000, 1_000);

    const result = performAdaptiveRateLimitCachePressureEvictionForTests("WARNING", 2_001);
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
    const shardSizes = getAdaptiveRateLimitCooldownShardSizesForTests();

    assert.ok(getAdaptiveRateLimitCooldownStats().bucketCount <= 4_096);
    assert.ok(shardSizes.every((size) => size <= 512));
    assert.equal(
      shardSizes.reduce((total, size) => total + size, 0),
      getAdaptiveRateLimitCooldownStats().bucketCount,
    );
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

test("auth adaptive cooldown cache near-capacity alert fires at ninety percent", (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  const warningLogs: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  const metricBefore = getInternalMetricsSnapshot()
    .counters.authAdaptiveRateLimitCooldownCacheNearCapacityAlertsTotal;
  t.mock.method(logger, "warn", (message: string, payload?: Record<string, unknown>) => {
    warningLogs.push({ message, payload });
  });

  try {
    const nowMs = Date.parse("2026-06-01T00:00:00.000Z");
    const alertThresholdEntries = Math.ceil(4_096 * 0.90);
    for (let index = 0; index < alertThresholdEntries; index += 1) {
      recordAdaptiveRateLimitViolationForTests(`near-capacity-client-${index}`, 60_000, nowMs);
    }
    recordAdaptiveRateLimitViolationForTests("near-capacity-client-extra", 60_000, nowMs + 1);

    const metricAfter = getInternalMetricsSnapshot()
      .counters.authAdaptiveRateLimitCooldownCacheNearCapacityAlertsTotal;
    assert.equal(metricAfter - metricBefore, 1);
    assert.ok(warningLogs.some((entry) =>
      entry.message === "Auth adaptive rate-limit cooldown cache near capacity"
      && entry.payload?.bucketCount === alertThresholdEntries
      && entry.payload?.maxBuckets === 4_096
      && entry.payload?.thresholdPercent === 90
      && entry.payload?.utilizationPercent === 90
    ));
  } finally {
    clearAdaptiveRateLimitCooldownsForTests();
  }
});

test("auth adaptive cooldown cache gauges track size and utilization", () => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  try {
    const clearedSnapshot = getInternalMetricsSnapshot();
    assert.equal(clearedSnapshot.gauges.authAdaptiveRateLimitCooldownCacheSize, 0);
    assert.equal(clearedSnapshot.gauges.authAdaptiveRateLimitCooldownCacheUtilization, 0);

    recordAdaptiveRateLimitViolationForTests("gauged-client", 60_000, 1_000);
    const populatedSnapshot = getInternalMetricsSnapshot();
    assert.equal(populatedSnapshot.gauges.authAdaptiveRateLimitCooldownCacheSize, 1);
    assert.equal(
      populatedSnapshot.gauges.authAdaptiveRateLimitCooldownCacheUtilization,
      1 / 4_096,
    );

    assert.equal(pruneAdaptiveRateLimitCooldowns(61_001), 1);
    const prunedSnapshot = getInternalMetricsSnapshot();
    assert.equal(prunedSnapshot.gauges.authAdaptiveRateLimitCooldownCacheSize, 0);
    assert.equal(prunedSnapshot.gauges.authAdaptiveRateLimitCooldownCacheUtilization, 0);
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

test("auth two-factor management limiter caps sensitive setup bursts at five per minute", async () => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { user: { username: string } }).user = { username: "admin.twofactor" };
    next();
  });
  const limiters = createAuthRouteRateLimiters();
  app.post("/two-factor/setup", limiters.twoFactorManagement, (_req, res) => {
    res.status(204).end();
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${baseUrl}/two-factor/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "Password123!" }),
      });
      assert.equal(response.status, 204);
    }

    const throttled = await fetch(`${baseUrl}/two-factor/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "Password123!" }),
    });

    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("ratelimit-limit"), "5");
    const payload = await throttled.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error?.code, ERROR_CODES.AUTH_MUTATION_RATE_LIMITED);
    assert.equal(
      payload.error?.message,
      "Too many two-factor security updates. Please wait before trying again.",
    );
    assert.equal(typeof payload.retryAfterMs, "number");
  } finally {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(server);
  }
});

test("password recovery, authenticated security, and admin action limits retain their strict caps", async (t) => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();
  t.mock.method(logger, "warn", () => undefined);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { user: { username: string } }).user = { username: "admin.security" };
    next();
  });
  const limiters = createAuthRouteRateLimiters();
  const cases = [
    { name: "publicRecovery", max: 20, code: ERROR_CODES.AUTH_RECOVERY_RATE_LIMITED },
    { name: "authenticatedAuth", max: 12, code: ERROR_CODES.AUTH_MUTATION_RATE_LIMITED },
    { name: "adminAction", max: 30, code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED },
    { name: "adminDestructiveAction", max: 10, code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED },
  ] as const;
  for (const scenario of cases) {
    app.post(`/${scenario.name}`, limiters[scenario.name], (_req, res) => res.status(204).end());
  }
  const { baseUrl, server } = await startTestServer(app);

  try {
    for (const scenario of cases) {
      for (let index = 0; index <= scenario.max; index += 1) {
        const response = await fetch(`${baseUrl}/${scenario.name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "admin.security" }),
        });
        assert.equal(response.status, index < scenario.max ? 204 : 429, scenario.name);
        if (index === scenario.max) {
          assert.equal(response.headers.get("ratelimit-limit"), String(scenario.max));
          assert.match(response.headers.get("retry-after") ?? "", /^[1-9]\d*$/);
          assert.equal((await response.json()).error.code, scenario.code);
        }
      }
    }
  } finally {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(server);
  }
});
