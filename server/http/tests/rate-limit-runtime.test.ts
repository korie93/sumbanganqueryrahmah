import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRateLimiterTopologyWarning,
  resolveSharedRateLimitStoreConfig,
} from "../../middleware/rate-limit-runtime";

test("resolveSharedRateLimitStoreConfig defaults to process-local memory storage", () => {
  assert.deepEqual(resolveSharedRateLimitStoreConfig({}), {
    distributedStoreConfigured: false,
    provider: "memory",
    redisUrl: null,
  });
});

test("resolveSharedRateLimitStoreConfig prepares redis shared-store configuration", () => {
  assert.deepEqual(
    resolveSharedRateLimitStoreConfig({
      provider: "redis",
      redisUrl: "rediss://redis.internal:6380/0",
    }),
    {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "rediss://redis.internal:6380/0",
    },
  );
});

test("resolveSharedRateLimitStoreConfig rejects incomplete redis configuration", () => {
  assert.throws(
    () => resolveSharedRateLimitStoreConfig({ provider: "redis" }),
    /SQR_REDIS_RATE_LIMIT_URL is required/i,
  );
  assert.throws(
    () => resolveSharedRateLimitStoreConfig({ provider: "redis", redisUrl: "http://redis.internal" }),
    /must start with redis:\/\/ or rediss:\/\//i,
  );
  assert.throws(
    () => resolveSharedRateLimitStoreConfig({ provider: "memory", redisUrl: "redis://redis.internal" }),
    /requires SQR_RATE_LIMIT_STORE=redis/i,
  );
});

test("buildRateLimiterTopologyWarning stays quiet for single-worker deployments", () => {
  assert.equal(
    buildRateLimiterTopologyWarning({
      distributedStoreConfigured: false,
      workerCount: 1,
    }),
    null,
  );
});

test("buildRateLimiterTopologyWarning stays quiet when a shared store is configured", () => {
  assert.equal(
    buildRateLimiterTopologyWarning({
      distributedStoreConfigured: true,
      workerCount: 4,
    }),
    null,
  );
});

test("buildRateLimiterTopologyWarning warns when multi-worker deployments still use in-memory storage", () => {
  const warning = buildRateLimiterTopologyWarning({
    distributedStoreConfigured: false,
    workerCount: 4,
  });

  assert.match(warning ?? "", /shared store/i);
  assert.match(warning ?? "", /in-memory/i);
});
