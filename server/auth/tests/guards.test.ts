import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthGuards,
  evictOldestTabVisibilityCacheEntryForTests,
  getInvalidatedSessionMessage,
} from "../guards";

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

  assert.equal(visibilityLookupCount, 2);
  assert.equal(nextCalls, 3);
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
