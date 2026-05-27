import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { Request } from "express";
import { ERROR_CODES } from "../../../shared/error-codes";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import {
  buildAuthRouteRateLimitSubject,
  buildRequestRateLimitFingerprint,
  clearAdaptiveRateLimitCooldownsForTests,
  createImportsUploadRateLimiter,
  createAuthRouteRateLimiters,
  getAdaptiveRateLimitCooldownStats,
  getAdaptiveRateLimitCooldownKeysForTests,
  normalizeAuthRateLimitIdentifier,
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

test("auth adaptive cooldown records violations through one bounded post-write prune path", async () => {
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

test("auth adaptive cooldown cap evicts least recently used buckets without scanning for oldest timestamps", () => {
  stopAdaptiveRateLimitCooldownSweep();
  clearAdaptiveRateLimitCooldownsForTests();

  try {
    const startedAt = Date.now();
    for (let index = 0; index < 4_096; index += 1) {
      recordAdaptiveRateLimitViolationForTests(`client-${index}`, 60_000, startedAt + index);
    }
    recordAdaptiveRateLimitViolationForTests("client-0", 60_000, startedAt + 4_096);
    recordAdaptiveRateLimitViolationForTests("client-new", 60_000, startedAt + 4_097);

    const keys = getAdaptiveRateLimitCooldownKeysForTests();
    assert.equal(keys.length, 4_096);
    assert.equal(keys.includes("client-0"), true);
    assert.equal(keys.includes("client-1"), false);
    assert.equal(keys[keys.length - 1], "client-new");
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
