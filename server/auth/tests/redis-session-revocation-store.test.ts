import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyRedisSessionRevocationError,
  RedisSessionRevocationErrorClass,
  RedisSessionRevocationStore,
  RedisSessionRevocationUnavailableError,
} from "../redis-session-revocation-store";
import {
  clearStartupServiceDegraded,
  getStartupHealthSnapshot,
} from "../../internal/startup-health";

const SESSION_REVOCATION_HEALTH_SERVICE = "session-revocation-store";

test.afterEach(() => {
  clearStartupServiceDegraded(SESSION_REVOCATION_HEALTH_SERVICE);
});

test("classifyRedisSessionRevocationError separates retryable and non-retryable failures", () => {
  assert.equal(
    classifyRedisSessionRevocationError(Object.assign(new Error("offline"), { code: "ECONNREFUSED" })),
    RedisSessionRevocationErrorClass.RETRYABLE,
  );
  assert.equal(
    classifyRedisSessionRevocationError(Object.assign(new Error("auth failed"), { code: "NOAUTH" })),
    RedisSessionRevocationErrorClass.NON_RETRYABLE,
  );
  assert.equal(
    classifyRedisSessionRevocationError(new Error("unexpected")),
    RedisSessionRevocationErrorClass.UNKNOWN,
  );
});

test("RedisSessionRevocationStore persists revoked JWT ids with a bounded TTL", async () => {
  const values = new Map<string, string>();
  const setCalls: Array<{ key: string; options: { PX: number }; value: string }> = [];
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        return undefined;
      },
      async get(key) {
        return values.get(key) ?? null;
      },
      async set(key, value, options) {
        values.set(key, value);
        setCalls.push({ key, options, value });
        return "OK";
      },
      async quit() {
        return undefined;
      },
    }),
    prefix: "sqr:test-session-revoked",
  });

  await store.revoke({
    jwtId: "jwt-1",
    expiresAtMs: Date.now() + 120_000,
  });

  assert.equal(setCalls.length, 1);
  assert.match(setCalls[0].key, /^sqr:test-session-revoked:[a-f0-9]{64}$/);
  assert.equal(setCalls[0].value, "1");
  assert.ok(setCalls[0].options.PX > 0);
  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(await store.isRevoked("jwt-2"), false);
});

test("RedisSessionRevocationStore rejects session checks closed when Redis is unavailable", async () => {
  const warnings: Array<{ message: string; payload: unknown }> = [];
  let now = 1_000;
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        throw new Error("redis offline");
      },
      async get() {
        throw new Error("should not get");
      },
      async set() {
        throw new Error("should not set");
      },
      async quit() {
        return undefined;
      },
    }),
    logger: {
      warn(message: string, payload: unknown) {
        warnings.push({ message, payload });
      },
    },
    now: () => now,
    warningRepeatMs: 5_000,
  });

  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].message, "Redis session revocation store unavailable; rejecting session checks closed");
  assert.deepEqual(warnings[0].payload, {
    classification: RedisSessionRevocationErrorClass.UNKNOWN,
    error: {
      name: "Error",
    },
    event: "session_revocation_redis_failure",
    operation: "connect",
    provider: "redis",
    retryable: false,
  });

  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(warnings.length, 1);

  now += 5_000;
  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(warnings.length, 2);
});

test("RedisSessionRevocationStore logs sanitized Redis failures and marks health degraded", async () => {
  const errors: Array<{ message: string; payload: unknown }> = [];
  const sensitiveError = Object.assign(
    new Error("redis://:secret@example.test token=jwt-1 userId=user-1"),
    { code: "ECONNREFUSED" },
  );
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        throw sensitiveError;
      },
      async get() {
        return null;
      },
      async set() {
        return "OK";
      },
      async quit() {
        return undefined;
      },
    }),
    logger: {
      warn() {
        return undefined;
      },
      error(message: string, payload: unknown) {
        errors.push({ message, payload });
      },
    },
  });

  assert.equal(await store.isRevoked("jwt-1"), true);

  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, "Redis session revocation store unavailable; rejecting session checks closed");
  assert.deepEqual(errors[0].payload, {
    classification: RedisSessionRevocationErrorClass.RETRYABLE,
    error: {
      code: "ECONNREFUSED",
      name: "Error",
    },
    event: "session_revocation_redis_failure",
    operation: "connect",
    provider: "redis",
    retryable: true,
  });
  assert.equal(JSON.stringify(errors[0].payload).includes("jwt-1"), false);
  assert.equal(JSON.stringify(errors[0].payload).includes("user-1"), false);
  assert.equal(JSON.stringify(errors[0].payload).includes("secret"), false);

  const degradedService = getStartupHealthSnapshot().degradedServices.find(
    (service) => service.service === SESSION_REVOCATION_HEALTH_SERVICE,
  );
  assert.equal(degradedService?.reason, "SESSION_REVOCATION_REDIS_UNAVAILABLE");
  assert.equal(degradedService?.details, RedisSessionRevocationErrorClass.RETRYABLE);
});

test("RedisSessionRevocationStore clears degraded health after Redis recovers", async () => {
  let connectAttempts = 0;
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => {
      connectAttempts += 1;
      const shouldFail = connectAttempts === 1;
      return {
        async connect() {
          if (shouldFail) {
            throw Object.assign(new Error("redis offline"), { code: "ECONNRESET" });
          }
        },
        async get() {
          return null;
        },
        async set() {
          return "OK";
        },
        async quit() {
          return undefined;
        },
      };
    },
    logger: {
      warn() {
        return undefined;
      },
    },
  });

  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(
    getStartupHealthSnapshot().degradedServices.some(
      (service) => service.service === SESSION_REVOCATION_HEALTH_SERVICE,
    ),
    true,
  );

  assert.equal(await store.isRevoked("jwt-1"), false);
  assert.equal(
    getStartupHealthSnapshot().degradedServices.some(
      (service) => service.service === SESSION_REVOCATION_HEALTH_SERVICE,
    ),
    false,
  );
});

test("RedisSessionRevocationStore retries after a failed Redis connection", async () => {
  let factoryCalls = 0;
  let getCalls = 0;
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => {
      factoryCalls += 1;
      const shouldFailConnect = factoryCalls === 1;
      return {
        async connect() {
          if (shouldFailConnect) {
            throw new Error("first redis connect failed");
          }
        },
        async get() {
          getCalls += 1;
          return null;
        },
        async set() {
          return "OK";
        },
        async quit() {
          return undefined;
        },
      };
    },
    logger: {
      warn() {
        return undefined;
      },
    },
  });

  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(await store.isRevoked("jwt-1"), false);
  assert.equal(factoryCalls, 2);
  assert.equal(getCalls, 1);
});

test("RedisSessionRevocationStore rejects revocation writes when Redis is unavailable", async () => {
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        throw new Error("redis offline");
      },
      async get() {
        return null;
      },
      async set() {
        return "OK";
      },
      async quit() {
        return undefined;
      },
    }),
    logger: {
      warn() {
        return undefined;
      },
    },
  });

  await assert.rejects(
    store.revoke({
      expiresAtMs: Date.now() + 120_000,
      jwtId: "jwt-1",
    }),
    RedisSessionRevocationUnavailableError,
  );
});
