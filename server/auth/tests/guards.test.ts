import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  createAuthGuards,
  evictOldestTabVisibilityCacheEntryForTests,
  getInvalidatedSessionMessage,
  sweepExpiredActivityUpdateCacheEntriesForTests,
  sweepExpiredTabVisibilityCacheEntriesForTests,
} from "../guards";
import { logger } from "../../lib/logger";
import { getInternalMetricsSnapshot } from "../../internal/metrics";
import {
  resetSessionRevocationStoreForTests,
  revokeSessionJwt,
} from "../session-revocation-store";

test("getInvalidatedSessionMessage returns reset-specific messaging for password reset invalidation", () => {
  assert.equal(
    getInvalidatedSessionMessage("PASSWORD_RESET_BY_SUPERUSER"),
    "Password was reset. Please login again.",
  );
  assert.equal(
    getInvalidatedSessionMessage("PASSWORD_RESET_COMPLETED"),
    "Password was reset. Please login again.",
  );
});

test("getInvalidatedSessionMessage returns password-changed messaging for self-service invalidation", () => {
  assert.equal(
    getInvalidatedSessionMessage("PASSWORD_CHANGED"),
    "Password changed. Please login again.",
  );
});

test("getInvalidatedSessionMessage returns replaced-session messaging for newer logins", () => {
  assert.equal(
    getInvalidatedSessionMessage("NEW_SESSION"),
    "Your account was opened in another browser or device. Please login again.",
  );
});

test("getInvalidatedSessionMessage falls back to generic session expiry messaging", () => {
  assert.equal(
    getInvalidatedSessionMessage("IDLE_TIMEOUT"),
    "Session expired. Please login again.",
  );
  assert.equal(
    getInvalidatedSessionMessage(null),
    "Session expired. Please login again.",
  );
});

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    cookies: [] as Array<{ name: string; value: string }>,
    cookie(name: string, value: string) {
      this.cookies.push({ name, value });
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function createAuthenticatedSessionSnapshot() {
  return {
    activity: {
      id: "activity-1",
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      pcName: null,
      browser: "Chrome",
      fingerprint: "fingerprint-1",
      ipAddress: "203.0.113.10",
      loginTime: new Date("2026-04-13T00:00:00.000Z"),
      logoutTime: null,
      lastActivityTime: new Date("2026-04-13T00:05:00.000Z"),
      isActive: true,
      logoutReason: null,
    },
    user: {
      id: "user-1",
      username: "guard.user",
      passwordHash: "hashed",
      fullName: "Guard User",
      email: "guard.user@example.test",
      role: "admin",
      status: "active",
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      createdBy: "system",
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      passwordChangedAt: null,
      activatedAt: null,
      lastLoginAt: null,
      isBanned: false,
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      twoFactorConfiguredAt: null,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
    },
    isVisitorBanned: false,
  };
}

test("tab visibility guard caches role visibility and allows explicit cache clearing", async () => {
  let visibilityLookupCount = 0;
  const guards = createAuthGuards({
    storage: {
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => {
        visibilityLookupCount += 1;
        return { monitor: true };
      },
    },
    secret: "guard-test-secret",
  });
  const handler = guards.requireTabAccess("monitor");
  const request = { user: { role: "admin" } };
  const response = createMockResponse();
  let nextCalls = 0;
  const next = () => {
    nextCalls += 1;
  };

  await handler(request as never, response as never, next);
  await handler(request as never, response as never, next);
  guards.clearTabVisibilityCache();
  await handler(request as never, response as never, next);
  guards.stopTabVisibilityCacheSweep();

  assert.equal(visibilityLookupCount, 2);
  assert.equal(nextCalls, 3);
});

test("tab visibility cache keeps the original TTL instead of extending it on cache hits", async (t) => {
  let visibilityLookupCount = 0;
  const nowValues = [
    1_000_000,
    1_000_000 + 4 * 60 * 1000,
    1_000_000 + 5 * 60 * 1000 + 1,
  ];

  t.mock.method(Date, "now", () => nowValues.shift() ?? 1_000_000 + 5 * 60 * 1000 + 1);

  const guards = createAuthGuards({
    storage: {
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => {
        visibilityLookupCount += 1;
        return { monitor: true };
      },
    },
    secret: "guard-test-secret",
  });

  const handler = guards.requireTabAccess("monitor");
  const request = { user: { role: "admin" } };
  const response = createMockResponse();

  await handler(request as never, response as never, () => undefined);
  await handler(request as never, response as never, () => undefined);
  await handler(request as never, response as never, () => undefined);
  guards.stopTabVisibilityCacheSweep();

  assert.equal(visibilityLookupCount, 2);
});

test("tab visibility cache helper evicts the least recently used role entry", () => {
  const cache = new Map([
    ["admin", { tabs: { monitor: true }, cachedAt: 100 }],
    ["user", { tabs: { monitor: false }, cachedAt: 50 }],
    ["auditor", { tabs: { monitor: true }, cachedAt: 75 }],
  ]);

  const evicted = evictOldestTabVisibilityCacheEntryForTests(cache);

  assert.equal(evicted, "user");
  assert.deepEqual(Array.from(cache.keys()), ["admin", "auditor"]);
});

test("tab visibility cache sweep removes expired entries without waiting for a role read", () => {
  const now = 1_000_000;
  const cache = new Map([
    ["fresh", { tabs: { monitor: true }, cachedAt: now - 60_000 }],
    ["expired", { tabs: { monitor: false }, cachedAt: now - 6 * 60_000 }],
  ]);

  const removed = sweepExpiredTabVisibilityCacheEntriesForTests(cache, now);

  assert.equal(removed, 1);
  assert.deepEqual(Array.from(cache.keys()), ["fresh"]);
});

test("activity update cache sweep removes expired entries without waiting for the next request", () => {
  const now = 1_000_000;
  const cache = new Map([
    ["fresh", now - 30_000],
    ["expired", now - 3 * 60_000],
  ]);

  const removed = sweepExpiredActivityUpdateCacheEntriesForTests(cache, now);

  assert.equal(removed, 1);
  assert.deepEqual(Array.from(cache.keys()), ["fresh"]);
});

test("auth guard caches register unrefed sweep intervals and clear them idempotently", (t) => {
  const capturedIntervalMs: number[] = [];
  let unrefCalls = 0;
  const fakeHandles = [{
    unref() {
      unrefCalls += 1;
      return this;
    },
  }, {
    unref() {
      unrefCalls += 1;
      return this;
    },
  }] as unknown as NodeJS.Timeout[];
  const clearedHandles: NodeJS.Timeout[] = [];

  const setIntervalMock = t.mock.method(
    globalThis,
    "setInterval",
    (((handler: TimerHandler, delay?: number) => {
      assert.equal(typeof handler, "function");
      capturedIntervalMs.push(Number(delay ?? 0));
      return fakeHandles[capturedIntervalMs.length - 1];
    }) as unknown) as typeof setInterval,
  );
  const clearIntervalMock = t.mock.method(
    globalThis,
    "clearInterval",
    (((handle?: NodeJS.Timeout) => {
      if (handle) {
        clearedHandles.push(handle);
      }
    }) as unknown) as typeof clearInterval,
  );

  const guards = createAuthGuards({
    storage: {
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret: "guard-test-secret",
  });

  assert.equal(setIntervalMock.mock.callCount(), 2);
  assert.deepEqual(capturedIntervalMs, [5 * 60 * 1000, 2 * 60 * 1000]);
  assert.equal(unrefCalls, 2);

  guards.stopTabVisibilityCacheSweep();
  guards.stopActivityUpdateCacheSweep();
  guards.stopTabVisibilityCacheSweep();
  guards.stopActivityUpdateCacheSweep();

  assert.equal(clearIntervalMock.mock.callCount(), 2);
  assert.deepEqual(clearedHandles, fakeHandles);
});

test("authenticateToken prefers the composite session snapshot when storage exposes it", async () => {
  const secret = "guard-test-secret";
  let snapshotCalls = 0;
  let activityCalls = 0;
  let userCalls = 0;
  let bannedCalls = 0;
  let updateCalls = 0;

  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => {
        snapshotCalls += 1;
        return {
          activity: {
            id: "activity-1",
            userId: "user-1",
            username: "guard.user",
            role: "admin",
            pcName: null,
            browser: "Chrome",
            fingerprint: "fingerprint-1",
            ipAddress: "203.0.113.10",
            loginTime: new Date("2026-04-13T00:00:00.000Z"),
            logoutTime: null,
            lastActivityTime: new Date("2026-04-13T00:05:00.000Z"),
            isActive: true,
            logoutReason: null,
          },
          user: {
            id: "user-1",
            username: "guard.user",
            passwordHash: "hashed",
            fullName: "Guard User",
            email: "guard.user@example.test",
            role: "admin",
            status: "active",
            mustChangePassword: false,
            passwordResetBySuperuser: false,
            createdBy: "system",
            createdAt: new Date("2026-04-01T00:00:00.000Z"),
            updatedAt: new Date("2026-04-01T00:00:00.000Z"),
            passwordChangedAt: null,
            activatedAt: null,
            lastLoginAt: null,
            isBanned: false,
            twoFactorEnabled: false,
            twoFactorSecretEncrypted: null,
            twoFactorConfiguredAt: null,
            failedLoginAttempts: 0,
            lockedAt: null,
            lockedReason: null,
            lockedBySystem: false,
          },
          isVisitorBanned: false,
        };
      },
      getActivityById: async () => {
        activityCalls += 1;
        return undefined;
      },
      getUser: async () => {
        userCalls += 1;
        return undefined;
      },
      getUserByUsername: async () => {
        userCalls += 1;
        return undefined;
      },
      isVisitorBanned: async () => {
        bannedCalls += 1;
        return false;
      },
      updateActivity: async () => {
        updateCalls += 1;
        return undefined;
      },
      getRoleTabVisibility: async () => ({}),
    },
    secret,
  });

  const token = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
    },
    secret,
    { expiresIn: "24h" },
  );

  const request = {
    headers: {
      cookie: `sqr_auth=${encodeURIComponent(token)}`,
    },
    method: "GET",
    path: "/api/me",
  };
  const response = createMockResponse();
  let nextCalls = 0;

  await guards.authenticateToken(request as never, response as never, () => {
    nextCalls += 1;
  });
  guards.stopTabVisibilityCacheSweep();

  assert.equal(snapshotCalls, 1);
  assert.equal(activityCalls, 0);
  assert.equal(userCalls, 0);
  assert.equal(bannedCalls, 0);
  assert.equal(updateCalls, 1);
  assert.equal(nextCalls, 1);
  assert.equal((request as { user?: { username?: string } }).user?.username, "guard.user");
});

test("authenticateToken invalidates sessions with missing database identity fields", async () => {
  const secret = "guard-test-secret";
  const snapshot = createAuthenticatedSessionSnapshot();
  const beforeMetric = getInternalMetricsSnapshot().counters.authIdentityFallbackTotal;
  const originalLoggerWarn = logger.warn;
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  logger.warn = ((message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => ({
        ...snapshot,
        user: {
          ...snapshot.user,
          id: undefined,
          username: undefined,
        } as never,
      }),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async (_activityId, payload) => {
        updateCalls += 1;
        assert.equal(payload.logoutReason, "USER_IDENTITY_INCOMPLETE");
        return undefined;
      },
      getRoleTabVisibility: async () => ({}),
    },
    secret,
  });

  const token = jwt.sign(
    {
      userId: "token-user",
      username: "token.user",
      role: "user",
      activityId: "activity-1",
    },
    secret,
    { expiresIn: "24h" },
  );
  const request = {
    headers: {
      cookie: `sqr_auth=${encodeURIComponent(token)}`,
    },
    method: "GET",
    path: "/api/me",
  };
  const response = createMockResponse();
  let nextCalls = 0;
  let updateCalls = 0;

  try {
    await guards.authenticateToken(request as never, response as never, () => {
      nextCalls += 1;
    });

    assert.equal(nextCalls, 0);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      message: "Session expired. Please login again.",
      forceLogout: true,
      code: "ACCOUNT_UNAVAILABLE",
    });
    assert.equal(updateCalls, 1);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "Authenticated session invalidated because database identity fields are missing");
    assert.deepEqual(warnings[0].payload.missingIdentityFields, ["userId", "username"]);
    assert.doesNotMatch(JSON.stringify(warnings[0].payload), /guard\.user|token\.user|user-1|token-user/);
    assert.equal(getInternalMetricsSnapshot().counters.authIdentityFallbackTotal, beforeMetric + 1);
  } finally {
    logger.warn = originalLoggerWarn;
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
  }
});

test("authenticateToken rejects structurally invalid JWT payloads before storage lookups", async () => {
  const secret = "guard-test-secret";
  let storageLookupCount = 0;
  const guards = createAuthGuards({
    storage: {
      getActivityById: async () => {
        storageLookupCount += 1;
        return undefined;
      },
      getUser: async () => {
        storageLookupCount += 1;
        return undefined;
      },
      getUserByUsername: async () => {
        storageLookupCount += 1;
        return undefined;
      },
      isVisitorBanned: async () => {
        storageLookupCount += 1;
        return false;
      },
      updateActivity: async () => {
        storageLookupCount += 1;
        return undefined;
      },
      getRoleTabVisibility: async () => ({}),
    },
    secret,
  });
  const token = jwt.sign(
    {
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
    },
    secret,
    { expiresIn: "24h" },
  );
  const response = createMockResponse();
  let nextCalls = 0;

  try {
    await guards.authenticateToken(
      {
        headers: {
          cookie: `sqr_auth=${encodeURIComponent(token)}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      response as never,
      () => {
        nextCalls += 1;
      },
    );

    assert.equal(nextCalls, 0);
    assert.equal(storageLookupCount, 0);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Invalid token" });
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
  }
});

test("authenticateToken throttles healthy activity updates per session id", async (t) => {
  const secret = "guard-test-secret";
  let now = new Date("2026-04-29T00:00:00.000Z").getTime();
  t.mock.method(Date, "now", () => now);

  const updateActivityPayloads: Array<Record<string, unknown>> = [];
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => ({
        activity: {
          id: "activity-1",
          userId: "user-1",
          username: "guard.user",
          role: "admin",
          pcName: null,
          browser: "Chrome",
          fingerprint: "fingerprint-1",
          ipAddress: "203.0.113.10",
          loginTime: new Date("2026-04-13T00:00:00.000Z"),
          logoutTime: null,
          lastActivityTime: new Date("2026-04-13T00:05:00.000Z"),
          isActive: true,
          logoutReason: null,
        },
        user: {
          id: "user-1",
          username: "guard.user",
          passwordHash: "hashed",
          fullName: "Guard User",
          email: "guard.user@example.test",
          role: "admin",
          status: "active",
          mustChangePassword: false,
          passwordResetBySuperuser: false,
          createdBy: "system",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          passwordChangedAt: null,
          activatedAt: null,
          lastLoginAt: null,
          isBanned: false,
          twoFactorEnabled: false,
          twoFactorSecretEncrypted: null,
          twoFactorConfiguredAt: null,
          failedLoginAttempts: 0,
          lockedAt: null,
          lockedReason: null,
          lockedBySystem: false,
        },
        isVisitorBanned: false,
      }),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async (_activityId, payload) => {
        updateActivityPayloads.push(payload);
        return undefined;
      },
      getRoleTabVisibility: async () => ({}),
    },
    secret,
    activityUpdateThrottleMs: 30_000,
  });

  const token = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
    },
    secret,
    { expiresIn: "24h" },
  );
  const makeRequest = () => ({
    headers: {
      cookie: `sqr_auth=${encodeURIComponent(token)}`,
    },
    method: "GET",
    path: "/api/me",
  });

  let nextCalls = 0;
  await guards.authenticateToken(makeRequest() as never, createMockResponse() as never, () => {
    nextCalls += 1;
  });
  now += 5_000;
  await guards.authenticateToken(makeRequest() as never, createMockResponse() as never, () => {
    nextCalls += 1;
  });
  now += 31_000;
  await guards.authenticateToken(makeRequest() as never, createMockResponse() as never, () => {
    nextCalls += 1;
  });
  guards.stopTabVisibilityCacheSweep();

  assert.equal(nextCalls, 3);
  assert.equal(updateActivityPayloads.length, 2);
  for (const payload of updateActivityPayloads) {
    assert.ok(payload.lastActivityTime instanceof Date);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "isActive"), false);
  }
});

test("authenticateToken reserves activity updates before awaiting storage writes", async (t) => {
  const secret = "guard-test-secret";
  const now = new Date("2026-04-29T00:00:00.000Z").getTime();
  t.mock.method(Date, "now", () => now);

  let updateCalls = 0;
  let releaseFirstWrite: (() => void) | undefined;
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => createAuthenticatedSessionSnapshot(),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => {
        updateCalls += 1;
        if (updateCalls === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstWrite = resolve;
          });
        }
        return undefined;
      },
      getRoleTabVisibility: async () => ({}),
    },
    secret,
    activityUpdateThrottleMs: 30_000,
  });

  const token = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
    },
    secret,
    { expiresIn: "24h" },
  );
  const makeRequest = () => ({
    headers: {
      cookie: `sqr_auth=${encodeURIComponent(token)}`,
    },
    method: "GET",
    path: "/api/me",
  });

  let nextCalls = 0;
  const first = guards.authenticateToken(makeRequest() as never, createMockResponse() as never, () => {
    nextCalls += 1;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updateCalls, 1);

  await guards.authenticateToken(makeRequest() as never, createMockResponse() as never, () => {
    nextCalls += 1;
  });
  assert.equal(updateCalls, 1);

  assert.ok(releaseFirstWrite);
  releaseFirstWrite();
  await first;
  guards.stopTabVisibilityCacheSweep();
  guards.stopActivityUpdateCacheSweep();

  assert.equal(nextCalls, 2);
  assert.equal(updateCalls, 1);
});

test("authenticateToken rejects a JWT that was revoked during logout", async () => {
  resetSessionRevocationStoreForTests();
  const secret = "guard-test-secret";
  let snapshotCalls = 0;
  let updateCalls = 0;
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => {
        snapshotCalls += 1;
        return createAuthenticatedSessionSnapshot();
      },
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => {
        updateCalls += 1;
        return undefined;
      },
      getRoleTabVisibility: async () => ({}),
    },
    secret,
  });

  const token = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
    },
    secret,
    {
      expiresIn: "24h",
      jwtid: "revoked-jti",
    },
  );
  await revokeSessionJwt({
    jwtId: "revoked-jti",
    expiresAtMs: Date.now() + 60_000,
  });

  const response = createMockResponse();
  let nextCalls = 0;

  try {
    await guards.authenticateToken(
      {
        headers: {
          cookie: `sqr_auth=${encodeURIComponent(token)}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      response as never,
      () => {
        nextCalls += 1;
      },
    );

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      message: "Session expired. Please login again.",
      forceLogout: true,
    });
    assert.equal(nextCalls, 0);
    assert.equal(snapshotCalls, 0);
    assert.equal(updateCalls, 0);
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
    resetSessionRevocationStoreForTests();
  }
});

test("authenticateToken rejects a session invalidated between snapshot load and activity touch", async () => {
  const secret = "guard-test-secret";
  let snapshotCalls = 0;
  let touchCalls = 0;
  let updateCalls = 0;
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => {
        snapshotCalls += 1;
        return createAuthenticatedSessionSnapshot();
      },
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      touchAuthenticatedActivity: async () => {
        touchCalls += 1;
        return undefined;
      },
      updateActivity: async () => {
        updateCalls += 1;
        return undefined;
      },
      getRoleTabVisibility: async () => ({}),
    },
    secret,
    activityUpdateThrottleMs: 0,
  });

  const token = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
    },
    secret,
    { expiresIn: "24h" },
  );

  const response = createMockResponse();
  let nextCalls = 0;

  await guards.authenticateToken(
    {
      headers: {
        cookie: `sqr_auth=${encodeURIComponent(token)}`,
      },
      method: "GET",
      path: "/api/me",
    } as never,
    response as never,
    () => {
      nextCalls += 1;
    },
  );

  guards.stopTabVisibilityCacheSweep();
  guards.stopActivityUpdateCacheSweep();

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    message: "Session expired. Please login again.",
    forceLogout: true,
  });
  assert.equal(snapshotCalls, 1);
  assert.equal(touchCalls, 1);
  assert.equal(updateCalls, 0);
  assert.equal(nextCalls, 0);
});

test("authenticateToken returns 401 for invalid and expired JWTs", async () => {
  const secret = "guard-test-secret";
  const guards = createAuthGuards({
    storage: {
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret,
  });

  const expiredToken = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
    },
    secret,
    { expiresIn: "-1s" },
  );

  for (const token of ["not-a-valid-token", expiredToken]) {
    const response = createMockResponse();
    let nextCalls = 0;

    await guards.authenticateToken(
      {
        headers: {
          cookie: `sqr_auth=${encodeURIComponent(token)}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      response as never,
      () => {
        nextCalls += 1;
      },
    );

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Invalid token" });
    assert.equal(nextCalls, 0);
  }

  guards.stopTabVisibilityCacheSweep();
});

test("requireRole returns 401 when there is no authenticated user", () => {
  const guards = createAuthGuards({
    storage: {
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret: "guard-test-secret",
  });

  const response = createMockResponse();
  let nextCalls = 0;

  guards.requireRole("admin")({} as never, response as never, () => {
    nextCalls += 1;
  });
  guards.stopTabVisibilityCacheSweep();

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { message: "Unauthenticated" });
  assert.equal(nextCalls, 0);
});

test("requireRole returns 403 when the authenticated user lacks the required role", () => {
  const guards = createAuthGuards({
    storage: {
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret: "guard-test-secret",
  });

  const response = createMockResponse();
  let nextCalls = 0;

  guards.requireRole("superuser")(
    { user: { role: "admin" } } as never,
    response as never,
    () => {
      nextCalls += 1;
    },
  );
  guards.stopTabVisibilityCacheSweep();

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { message: "Insufficient permissions" });
  assert.equal(nextCalls, 0);
});
