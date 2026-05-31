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
import { verifySecurityAuditDetails } from "../../lib/security-audit-log";
import { getInternalMetricsSnapshot } from "../../internal/metrics";
import {
  configureSessionRevocationStoreForRuntime,
  resetSessionRevocationStoreForTests,
  isSessionJwtRevoked,
  revokeSessionJwt,
  type SessionRevocationRecord,
} from "../session-revocation-store";
import { AUTH_SESSION_REFRESH_HEADER_NAME } from "../session-cookie";

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

test("requireRole records tamper-evident permission denied audit entries", async () => {
  const auditLogs: Array<{
    action: string;
    details?: string | null;
    targetResource?: string | null;
    targetUser?: string | null;
  }> = [];
  const guards = createAuthGuards({
    storage: {
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
      createAuditLog: async (entry) => {
        auditLogs.push({
          action: entry.action,
          details: entry.details ?? null,
          targetResource: entry.targetResource ?? null,
          targetUser: entry.targetUser ?? null,
        });
        return {
          id: `audit-${auditLogs.length}`,
          action: entry.action,
          performedBy: entry.performedBy,
          requestId: entry.requestId ?? null,
          targetUser: entry.targetUser ?? null,
          targetResource: entry.targetResource ?? null,
          details: entry.details ?? null,
          timestamp: new Date("2026-05-31T00:00:00.000Z"),
        };
      },
    },
    secret: "guard-test-secret",
  });
  const response = createMockResponse();
  const handler = guards.requireRole("superuser");

  await handler({
    headers: { "user-agent": "Chromium" },
    ip: "203.0.113.10",
    socket: { remoteAddress: "203.0.113.10" },
    user: {
      activityId: "activity-1",
      role: "user",
      userId: "user-1",
      username: "guard.user",
    },
  } as never, response as never, () => undefined);

  assert.equal(response.statusCode, 403);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "AUTHZ_PERMISSION_DENIED");
  assert.equal(auditLogs[0].targetResource, "role");
  assert.equal(String(auditLogs[0].details).includes("user-1"), false);
  assert.equal(String(auditLogs[0].details).includes("203.0.113.10"), false);
  const verification = verifySecurityAuditDetails(auditLogs[0].details);
  assert.equal(verification.ok, true);
  if (verification.ok) {
    assert.equal(verification.entry.event, "AUTHZ_PERMISSION_DENIED");
    assert.equal(verification.entry.outcome, "blocked");
  }
});

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    cookies: [] as Array<{ name: string; value: string }>,
    headers: new Map<string, string>(),
    cookie(name: string, value: string) {
      this.cookies.push({ name, value });
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name.toLowerCase(), String(value));
      return this;
    },
    getHeader(name: string) {
      return this.headers.get(name.toLowerCase());
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

function expectApiError(message: string, code: string, extra?: Record<string, unknown>) {
  return {
    ok: false,
    message,
    ...(extra ?? {}),
    code,
    error: {
      code,
      message,
    },
  };
}

function createRedisRevocationError(code: string, message = "Redis revocation command failed") {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    reject,
    resolve,
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
    assert.deepEqual(response.body, expectApiError(
      "Session expired. Please login again.",
      "ACCOUNT_UNAVAILABLE",
      { forceLogout: true },
    ));
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
    assert.deepEqual(response.body, expectApiError("Invalid token", "INVALID_TOKEN"));
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
    assert.deepEqual(response.body, expectApiError(
      "Session expired. Please login again.",
      "TOKEN_EXPIRED",
      { forceLogout: true },
    ));
    assert.equal(nextCalls, 0);
    assert.equal(snapshotCalls, 0);
    assert.equal(updateCalls, 0);
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
    resetSessionRevocationStoreForTests();
  }
});

test("authenticateToken does not refresh a bearer JWT with 80 percent of its TTL remaining", async (t) => {
  resetSessionRevocationStoreForTests();
  const secret = "guard-test-secret";
  const nowMs = Date.parse("2026-05-27T00:00:00.000Z");
  const nowSeconds = Math.floor(nowMs / 1000);
  t.mock.method(Date, "now", () => nowMs);
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => createAuthenticatedSessionSnapshot(),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
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
      iat: nowSeconds - 20,
      exp: nowSeconds + 80,
    },
    secret,
    { jwtid: "fresh-refresh-jti" },
  );
  const response = createMockResponse();
  let nextCalls = 0;

  try {
    await guards.authenticateToken(
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      response as never,
      () => {
        nextCalls += 1;
      },
    );

    assert.equal(nextCalls, 1);
    assert.equal(response.getHeader(AUTH_SESSION_REFRESH_HEADER_NAME), undefined);
    assert.equal(await isSessionJwtRevoked("fresh-refresh-jti"), false);
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
    resetSessionRevocationStoreForTests();
  }
});

test("authenticateToken refreshes a bearer JWT inside the final 20 percent of TTL and revokes the old token", async (t) => {
  resetSessionRevocationStoreForTests();
  const secret = "guard-test-secret";
  const nowMs = Date.parse("2026-05-27T00:00:00.000Z");
  const nowSeconds = Math.floor(nowMs / 1000);
  t.mock.method(Date, "now", () => nowMs);
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => createAuthenticatedSessionSnapshot(),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret,
  });

  const oldToken = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
      iat: nowSeconds - 81,
      exp: nowSeconds + 19,
    },
    secret,
    { jwtid: "near-expiry-refresh-jti" },
  );
  const response = createMockResponse();
  let nextCalls = 0;

  try {
    await guards.authenticateToken(
      {
        headers: {
          authorization: `Bearer ${oldToken}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      response as never,
      () => {
        nextCalls += 1;
      },
    );

    const refreshedToken = String(response.getHeader(AUTH_SESSION_REFRESH_HEADER_NAME) || "");
    const refreshedPayload = jwt.verify(refreshedToken, secret) as {
      activityId?: string;
      exp?: number;
      jti?: string;
      userId?: string;
    };

    assert.equal(nextCalls, 1);
    assert.notEqual(refreshedToken, "");
    assert.notEqual(refreshedToken, oldToken);
    assert.equal(refreshedPayload.activityId, "activity-1");
    assert.equal(refreshedPayload.userId, "user-1");
    assert.notEqual(refreshedPayload.jti, "near-expiry-refresh-jti");
    assert.ok(Number(refreshedPayload.exp) > nowSeconds + 19);
    assert.equal(await isSessionJwtRevoked("near-expiry-refresh-jti"), true);

    const rejectedResponse = createMockResponse();
    let rejectedNextCalls = 0;
    await guards.authenticateToken(
      {
        headers: {
          authorization: `Bearer ${oldToken}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      rejectedResponse as never,
      () => {
        rejectedNextCalls += 1;
      },
    );

    assert.equal(rejectedNextCalls, 0);
    assert.equal(rejectedResponse.statusCode, 401);
    assert.deepEqual(rejectedResponse.body, expectApiError(
      "Session expired. Please login again.",
      "TOKEN_EXPIRED",
      { forceLogout: true },
    ));
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
    resetSessionRevocationStoreForTests();
  }
});

test("authenticateToken coalesces concurrent refreshes for the same JWT id", async (t) => {
  resetSessionRevocationStoreForTests();
  const secret = "guard-test-secret";
  const nowMs = Date.parse("2026-05-27T00:00:00.000Z");
  const nowSeconds = Math.floor(nowMs / 1000);
  const revokedJwtIds = new Set<string>();
  const revokeStarted = createDeferred();
  const releaseRevoke = createDeferred();
  let revokeAttempts = 0;
  t.mock.method(Date, "now", () => nowMs);

  const restoreRevocationStore = configureSessionRevocationStoreForRuntime({
    isRevoked: async (jwtId: string) => revokedJwtIds.has(jwtId),
    revoke: async (record: SessionRevocationRecord) => {
      revokeAttempts += 1;
      revokeStarted.resolve();
      await releaseRevoke.promise;
      revokedJwtIds.add(record.jwtId);
    },
    close: () => {
      revokedJwtIds.clear();
    },
  });

  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => createAuthenticatedSessionSnapshot(),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret,
  });

  const oldToken = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
      iat: nowSeconds - 81,
      exp: nowSeconds + 19,
    },
    secret,
    { jwtid: "near-expiry-concurrent-jti" },
  );
  const firstResponse = createMockResponse();
  const secondResponse = createMockResponse();
  let nextCalls = 0;

  try {
    const firstAuth = guards.authenticateToken(
      {
        headers: {
          authorization: `Bearer ${oldToken}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      firstResponse as never,
      () => {
        nextCalls += 1;
      },
    );

    await revokeStarted.promise;

    const secondAuth = guards.authenticateToken(
      {
        headers: {
          authorization: `Bearer ${oldToken}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      secondResponse as never,
      () => {
        nextCalls += 1;
      },
    );

    releaseRevoke.resolve();
    await Promise.all([firstAuth, secondAuth]);

    const firstRefreshedToken = String(firstResponse.getHeader(AUTH_SESSION_REFRESH_HEADER_NAME) || "");
    const secondRefreshedToken = String(secondResponse.getHeader(AUTH_SESSION_REFRESH_HEADER_NAME) || "");

    assert.equal(nextCalls, 2);
    assert.equal(revokeAttempts, 1);
    assert.notEqual(firstRefreshedToken, "");
    assert.equal(secondRefreshedToken, firstRefreshedToken);
    assert.equal(revokedJwtIds.has("near-expiry-concurrent-jti"), true);
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
    restoreRevocationStore();
    resetSessionRevocationStoreForTests();
  }
});

test("authenticateToken retries transient JWT refresh revocation failures", async (t) => {
  resetSessionRevocationStoreForTests();
  const secret = "guard-test-secret";
  const nowMs = Date.parse("2026-05-27T00:00:00.000Z");
  const nowSeconds = Math.floor(nowMs / 1000);
  const revokedJwtIds = new Set<string>();
  const warnings: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  let revokeAttempts = 0;
  t.mock.method(Date, "now", () => nowMs);
  t.mock.method(logger, "warn", (message: string, payload?: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });
  const restoreRevocationStore = configureSessionRevocationStoreForRuntime({
    isRevoked: async (jwtId: string) => revokedJwtIds.has(jwtId),
    revoke: async (record: SessionRevocationRecord) => {
      revokeAttempts += 1;
      if (revokeAttempts < 3) {
        throw createRedisRevocationError("ECONNRESET");
      }
      revokedJwtIds.add(record.jwtId);
    },
    close: () => {
      revokedJwtIds.clear();
    },
  });
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => createAuthenticatedSessionSnapshot(),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret,
    sessionRefreshRevocationRetry: {
      attempts: 3,
      baseDelayMs: 0,
      maxDelayMs: 0,
    },
  });

  const oldToken = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
      iat: nowSeconds - 81,
      exp: nowSeconds + 19,
    },
    secret,
    { jwtid: "near-expiry-retry-jti" },
  );
  const response = createMockResponse();
  let nextCalls = 0;

  try {
    await guards.authenticateToken(
      {
        headers: {
          authorization: `Bearer ${oldToken}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      response as never,
      () => {
        nextCalls += 1;
      },
    );

    const refreshedToken = String(response.getHeader(AUTH_SESSION_REFRESH_HEADER_NAME) || "");
    assert.equal(nextCalls, 1);
    assert.notEqual(refreshedToken, "");
    assert.equal(revokeAttempts, 3);
    assert.equal(revokedJwtIds.has("near-expiry-retry-jti"), true);
    assert.equal(warnings.length, 2);
    assert.equal(warnings[0]?.message, "Retrying JWT refresh revocation after failure");
    assert.equal(warnings[0]?.payload?.event, "session_refresh_revocation_retry");
    assert.equal(warnings[0]?.payload?.attempt, 1);
    assert.equal(warnings[1]?.payload?.attempt, 2);
    assert.deepEqual(warnings[0]?.payload?.error, {
      code: "ECONNRESET",
      name: "Error",
      retryable: true,
    });
    assert.doesNotMatch(JSON.stringify(warnings), /near-expiry-retry-jti|guard\.user|user-1/);
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
    restoreRevocationStore();
    resetSessionRevocationStoreForTests();
  }
});

test("authenticateToken spreads JWT refresh revocation retries with full jitter", async (t) => {
  resetSessionRevocationStoreForTests();
  const secret = "guard-test-secret";
  const nowMs = Date.parse("2026-05-27T00:00:00.000Z");
  const nowSeconds = Math.floor(nowMs / 1000);
  const revokedJwtIds = new Set<string>();
  const retryDelaysMs: number[] = [];
  const warnings: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  const randomValues = [0.25, 0.75];
  let randomCalls = 0;
  let revokeAttempts = 0;
  const metricBefore = getInternalMetricsSnapshot()
    .counters.sessionRefreshRevocationRetryAttemptsTotal;
  const timeoutHandle = {
    unref() {
      return this;
    },
  } as unknown as ReturnType<typeof setTimeout>;

  t.mock.method(Date, "now", () => nowMs);
  t.mock.method(logger, "warn", (message: string, payload?: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });
  const setTimeoutMock = t.mock.method(
    globalThis,
    "setTimeout",
    (((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      retryDelaysMs.push(Number(delay ?? 0));
      if (typeof handler === "function") {
        queueMicrotask(() => {
          (handler as (...timerArgs: unknown[]) => void)(...args);
        });
      }
      return timeoutHandle;
    }) as unknown) as typeof setTimeout,
  );
  const restoreRevocationStore = configureSessionRevocationStoreForRuntime({
    isRevoked: async (jwtId: string) => revokedJwtIds.has(jwtId),
    revoke: async (record: SessionRevocationRecord) => {
      revokeAttempts += 1;
      if (revokeAttempts < 3) {
        throw createRedisRevocationError("ETIMEDOUT");
      }
      revokedJwtIds.add(record.jwtId);
    },
  });
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => createAuthenticatedSessionSnapshot(),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret,
    sessionRefreshRevocationRetry: {
      attempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      random: () => randomValues[randomCalls++] ?? 0,
    },
  });

  const oldToken = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
      iat: nowSeconds - 81,
      exp: nowSeconds + 19,
    },
    secret,
    { jwtid: "near-expiry-jitter-jti" },
  );
  const response = createMockResponse();
  let nextCalls = 0;

  try {
    await guards.authenticateToken(
      {
        headers: {
          authorization: `Bearer ${oldToken}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      response as never,
      () => {
        nextCalls += 1;
      },
    );

    const metricAfter = getInternalMetricsSnapshot()
      .counters.sessionRefreshRevocationRetryAttemptsTotal;
    assert.equal(nextCalls, 1);
    assert.equal(revokeAttempts, 3);
    assert.deepEqual(retryDelaysMs, [25, 150]);
    assert.equal(setTimeoutMock.mock.callCount(), 2);
    assert.equal(randomCalls, 2);
    assert.equal(metricAfter - metricBefore, 2);
    assert.equal(revokedJwtIds.has("near-expiry-jitter-jti"), true);
    assert.equal(warnings.length, 2);
    assert.doesNotMatch(JSON.stringify(warnings), /near-expiry-jitter-jti|guard\.user|user-1/);
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
    restoreRevocationStore();
    resetSessionRevocationStoreForTests();
  }
});

test("authenticateToken does not retry non-retryable JWT refresh revocation failures", async (t) => {
  resetSessionRevocationStoreForTests();
  const secret = "guard-test-secret";
  const nowMs = Date.parse("2026-05-27T00:00:00.000Z");
  const nowSeconds = Math.floor(nowMs / 1000);
  const errors: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  const warnings: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  let revokeAttempts = 0;
  t.mock.method(Date, "now", () => nowMs);
  t.mock.method(logger, "warn", (message: string, payload?: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });
  t.mock.method(logger, "error", (message: string, payload?: Record<string, unknown>) => {
    errors.push({ message, payload });
  });
  const restoreRevocationStore = configureSessionRevocationStoreForRuntime({
    isRevoked: async () => false,
    revoke: async () => {
      revokeAttempts += 1;
      throw createRedisRevocationError("WRONGTYPE");
    },
  });
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => createAuthenticatedSessionSnapshot(),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret,
    sessionRefreshRevocationRetry: {
      attempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
    },
  });

  const oldToken = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
      iat: nowSeconds - 81,
      exp: nowSeconds + 19,
    },
    secret,
    { jwtid: "near-expiry-wrongtype-jti" },
  );
  const response = createMockResponse();
  let nextCalls = 0;

  try {
    await guards.authenticateToken(
      {
        headers: {
          authorization: `Bearer ${oldToken}`,
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
    assert.equal(revokeAttempts, 1);
    assert.equal(response.statusCode, 503);
    assert.equal(warnings.length, 0);
    assert.equal(errors.length, 1);
    assert.deepEqual(errors[0]?.payload?.error, {
      code: "WRONGTYPE",
      name: "Error",
      retryable: false,
    });
    assert.doesNotMatch(JSON.stringify(errors), /near-expiry-wrongtype-jti|guard\.user|user-1/);
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
    restoreRevocationStore();
    resetSessionRevocationStoreForTests();
  }
});

test("authenticateToken fails closed when JWT refresh revocation retries are exhausted", async (t) => {
  resetSessionRevocationStoreForTests();
  const secret = "guard-test-secret";
  const nowMs = Date.parse("2026-05-27T00:00:00.000Z");
  const nowSeconds = Math.floor(nowMs / 1000);
  const errors: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  const warnings: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  let revokeAttempts = 0;
  t.mock.method(Date, "now", () => nowMs);
  t.mock.method(logger, "warn", (message: string, payload?: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });
  t.mock.method(logger, "error", (message: string, payload?: Record<string, unknown>) => {
    errors.push({ message, payload });
  });
  const restoreRevocationStore = configureSessionRevocationStoreForRuntime({
    isRevoked: async () => false,
    revoke: async () => {
      revokeAttempts += 1;
      throw createRedisRevocationError("ETIMEDOUT");
    },
  });
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => createAuthenticatedSessionSnapshot(),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret,
    sessionRefreshRevocationRetry: {
      attempts: 2,
      baseDelayMs: 0,
      maxDelayMs: 0,
    },
  });

  const oldToken = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
      iat: nowSeconds - 81,
      exp: nowSeconds + 19,
    },
    secret,
    { jwtid: "near-expiry-fail-closed-jti" },
  );
  const response = createMockResponse();
  let nextCalls = 0;

  try {
    await guards.authenticateToken(
      {
        headers: {
          authorization: `Bearer ${oldToken}`,
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
    assert.equal(revokeAttempts, 2);
    assert.equal(response.getHeader(AUTH_SESSION_REFRESH_HEADER_NAME), undefined);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, expectApiError(
      "Session refresh is temporarily unavailable. Please try again.",
      "SESSION_REFRESH_UNAVAILABLE",
    ));
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.payload?.attempt, 1);
    assert.deepEqual(warnings[0]?.payload?.error, {
      code: "ETIMEDOUT",
      name: "Error",
      retryable: true,
    });
    assert.equal(errors.length, 1);
    assert.equal(
      errors[0]?.message,
      "Failed to revoke previous JWT during authenticated session refresh",
    );
    assert.doesNotMatch(JSON.stringify(errors), /near-expiry-fail-closed-jti|guard\.user|user-1/);
  } finally {
    guards.stopTabVisibilityCacheSweep();
    guards.stopActivityUpdateCacheSweep();
    restoreRevocationStore();
    resetSessionRevocationStoreForTests();
  }
});

test("authenticateToken refreshes cookie sessions without exposing the replacement JWT in a response header", async (t) => {
  resetSessionRevocationStoreForTests();
  const secret = "guard-test-secret";
  const nowMs = Date.parse("2026-05-27T00:00:00.000Z");
  const nowSeconds = Math.floor(nowMs / 1000);
  t.mock.method(Date, "now", () => nowMs);
  const guards = createAuthGuards({
    storage: {
      getAuthenticatedSessionSnapshot: async () => createAuthenticatedSessionSnapshot(),
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => ({}),
    },
    secret,
  });

  const oldToken = jwt.sign(
    {
      userId: "user-1",
      username: "guard.user",
      role: "admin",
      activityId: "activity-1",
      iat: nowSeconds - 81,
      exp: nowSeconds + 19,
    },
    secret,
    { jwtid: "near-expiry-cookie-refresh-jti" },
  );
  const response = createMockResponse();
  let nextCalls = 0;

  try {
    await guards.authenticateToken(
      {
        headers: {
          cookie: `sqr_auth=${encodeURIComponent(oldToken)}`,
        },
        method: "GET",
        path: "/api/me",
      } as never,
      response as never,
      () => {
        nextCalls += 1;
      },
    );

    const authCookie = response.cookies.find((cookie) => cookie.name === "sqr_auth");
    const csrfCookie = response.cookies.find((cookie) => cookie.name === "sqr_csrf");

    assert.equal(nextCalls, 1);
    assert.equal(response.getHeader(AUTH_SESSION_REFRESH_HEADER_NAME), undefined);
    assert.ok(authCookie);
    assert.notEqual(authCookie?.value, oldToken);
    assert.equal(csrfCookie, undefined);
    assert.equal(await isSessionJwtRevoked("near-expiry-cookie-refresh-jti"), true);
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
  assert.deepEqual(response.body, expectApiError(
    "Session expired. Please login again.",
    "TOKEN_EXPIRED",
    { forceLogout: true },
  ));
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
    assert.deepEqual(response.body, expectApiError("Invalid token", "INVALID_TOKEN"));
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
  assert.deepEqual(response.body, expectApiError("Unauthenticated", "UNAUTHORIZED"));
  assert.equal(nextCalls, 0);
});

test("requireRole returns 403 when the authenticated user lacks the required role", async () => {
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

  await guards.requireRole("superuser")(
    { user: { role: "admin" } } as never,
    response as never,
    () => {
      nextCalls += 1;
    },
  );
  guards.stopTabVisibilityCacheSweep();

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, expectApiError("Insufficient permissions", "PERMISSION_DENIED"));
  assert.equal(nextCalls, 0);
});
