import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  createAuthGuards,
  evictOldestTabVisibilityCacheEntryForTests,
  getInvalidatedSessionMessage,
  sweepExpiredTabVisibilityCacheEntriesForTests,
} from "../guards";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;

  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

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

test("tab visibility guard coalesces concurrent role visibility lookups", async () => {
  let visibilityLookupCount = 0;
  const visibilityLookup = createDeferred<Record<string, boolean>>();

  const guards = createAuthGuards({
    storage: {
      getActivityById: async () => undefined,
      getUser: async () => undefined,
      getUserByUsername: async () => undefined,
      isVisitorBanned: async () => false,
      updateActivity: async () => undefined,
      getRoleTabVisibility: async () => {
        visibilityLookupCount += 1;
        return await visibilityLookup.promise;
      },
    },
    secret: "guard-test-secret",
  });

  const handler = guards.requireTabAccess("monitor");
  const request = { user: { role: "admin" } };
  const firstResponse = createMockResponse();
  const secondResponse = createMockResponse();
  let nextCalls = 0;

  const first = handler(request as never, firstResponse as never, () => {
    nextCalls += 1;
  });
  const second = handler(request as never, secondResponse as never, () => {
    nextCalls += 1;
  });

  assert.equal(visibilityLookupCount, 1);
  visibilityLookup.resolve({ monitor: true });

  await Promise.all([first, second]);
  guards.stopTabVisibilityCacheSweep();

  assert.equal(visibilityLookupCount, 1);
  assert.equal(nextCalls, 2);
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

test("tab visibility cache registers an unrefed sweep interval and clears it idempotently", (t) => {
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

  assert.equal(setIntervalMock.mock.callCount(), 1);
  assert.equal(capturedIntervalMs, 5 * 60 * 1000);
  assert.equal(unrefCalled, true);

  guards.stopTabVisibilityCacheSweep();
  guards.stopTabVisibilityCacheSweep();

  assert.equal(clearIntervalMock.mock.callCount(), 1);
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
