import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRuntimeWsSharedBusEvent,
  serializeRuntimeWsSharedBusEvent,
} from "../runtime-shared-bus";
import { resolveRuntimeWsSharedBusConfig } from "../runtime-shared-bus-config";

test("runtime WebSocket shared bus serializes and parses broadcast events", () => {
  const serialized = serializeRuntimeWsSharedBusEvent("instance-a", {
    payload: { type: "settings_updated" },
    type: "broadcast",
  });

  assert.ok(serialized);
  const parsed = parseRuntimeWsSharedBusEvent(serialized);

  assert.equal(parsed?.originId, "instance-a");
  assert.equal(parsed?.type, "broadcast");
  assert.deepEqual(parsed && "payload" in parsed ? parsed.payload : null, {
    type: "settings_updated",
  });
});

test("runtime WebSocket shared bus rejects malformed or oversized events", () => {
  assert.equal(parseRuntimeWsSharedBusEvent("{"), null);
  assert.equal(parseRuntimeWsSharedBusEvent(JSON.stringify({ type: "broadcast" })), null);
  assert.equal(parseRuntimeWsSharedBusEvent("x".repeat(100 * 1024)), null);
});

test("resolveRuntimeWsSharedBusConfig accepts redis with explicit or shared URL", () => {
  assert.deepEqual(resolveRuntimeWsSharedBusConfig({}), {
    distributedBusConfigured: false,
    provider: "memory",
    redisUrl: null,
  });
  assert.deepEqual(resolveRuntimeWsSharedBusConfig({
    provider: "redis",
    sharedRedisUrl: "rediss://redis.internal:6380/0",
  }), {
    distributedBusConfigured: true,
    provider: "redis",
    redisUrl: "rediss://redis.internal:6380/0",
  });
  assert.deepEqual(resolveRuntimeWsSharedBusConfig({
    provider: "redis",
    redisUrl: "redis://ws-redis.internal:6379/0",
    sharedRedisUrl: "redis://rate-limit.internal:6379/0",
  }), {
    distributedBusConfigured: true,
    provider: "redis",
    redisUrl: "redis://ws-redis.internal:6379/0",
  });
});

test("resolveRuntimeWsSharedBusConfig rejects unsafe redis configuration", () => {
  assert.throws(
    () => resolveRuntimeWsSharedBusConfig({ provider: "redis" }),
    /SQR_REDIS_WS_URL or SQR_REDIS_RATE_LIMIT_URL is required/i,
  );
  assert.throws(
    () => resolveRuntimeWsSharedBusConfig({ provider: "redis", redisUrl: "http://redis.internal" }),
    /must start with redis:\/\/ or rediss:\/\//i,
  );
  assert.throws(
    () => resolveRuntimeWsSharedBusConfig({ provider: "memory", redisUrl: "redis://redis.internal" }),
    /requires SQR_WS_SHARED_BUS=redis/i,
  );
});
