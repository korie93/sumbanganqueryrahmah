import assert from "node:assert/strict";
import test from "node:test";
import {
  createRedisHealthReconnectStrategy,
  RedisHealthMonitor,
} from "../redis-health-monitor";

class FakeRedisHealthClient {
  connectCalls = 0;
  pingCalls = 0;
  quitCalls = 0;

  constructor(
    private readonly options: {
      connectError?: Error;
      pingError?: Error;
    } = {},
  ) {}

  async connect() {
    this.connectCalls += 1;
    if (this.options.connectError) {
      throw this.options.connectError;
    }
  }

  on() {
    return undefined;
  }

  async ping() {
    this.pingCalls += 1;
    if (this.options.pingError) {
      throw this.options.pingError;
    }
    return "PONG";
  }

  async quit() {
    this.quitCalls += 1;
  }
}

function createTestLogger() {
  const infos: Array<{ message: string; metadata: Record<string, unknown> }> = [];
  const warnings: Array<{ message: string; metadata: Record<string, unknown> }> = [];

  return {
    infos,
    logger: {
      info: (message: string, metadata: Record<string, unknown>) => {
        infos.push({ message, metadata });
      },
      warn: (message: string, metadata: Record<string, unknown>) => {
        warnings.push({ message, metadata });
      },
    },
    warnings,
  };
}

test("Redis health monitor pings each unique configured endpoint and closes clients", async () => {
  const { logger, warnings } = createTestLogger();
  const client = new FakeRedisHealthClient();
  const factoryUrls: string[] = [];
  const monitor = new RedisHealthMonitor({
    createRedisClient: (options) => {
      factoryUrls.push(options.url);
      return client;
    },
    intervalMs: 5_000,
    logger,
    targets: [
      { label: "rate-limit", redisUrl: "redis://:secret@redis.internal:6379/0" },
      { label: "websocket", redisUrl: "redis://:secret@redis.internal:6379/0" },
      { label: "memory-only", redisUrl: null },
    ],
  });

  assert.equal(monitor.targetCount, 1);
  await monitor.checkOnce();
  assert.deepEqual(factoryUrls, ["redis://:secret@redis.internal:6379/0"]);
  assert.equal(client.connectCalls, 1);
  assert.equal(client.pingCalls, 1);
  assert.equal(warnings.length, 0);

  await monitor.stop();
  assert.equal(client.quitCalls, 1);
});

test("Redis health monitor repeats outage warnings on cadence without logging credentials", async () => {
  const { logger, warnings } = createTestLogger();
  let now = 1_000;
  const monitor = new RedisHealthMonitor({
    createRedisClient: () => new FakeRedisHealthClient({
      connectError: new Error("redis down"),
    }),
    intervalMs: 5_000,
    logger,
    now: () => now,
    targets: [{ label: "rate-limit", redisUrl: "redis://:secret@redis.internal:6379/0" }],
    warningRepeatMs: 5_000,
  });

  await monitor.checkOnce();
  now = 2_000;
  await monitor.checkOnce();
  now = 6_001;
  await monitor.checkOnce();

  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].message, "Redis health monitor target unavailable");
  assert.equal(warnings[0].metadata.endpoint, "redis://redis.internal:6379/0");
  assert.doesNotMatch(JSON.stringify(warnings[0].metadata), /secret/);
  await monitor.stop();
});

test("Redis health monitor logs recovery after a failed heartbeat", async () => {
  const { infos, logger, warnings } = createTestLogger();
  const clients = [
    new FakeRedisHealthClient({ pingError: new Error("timeout") }),
    new FakeRedisHealthClient(),
  ];
  const monitor = new RedisHealthMonitor({
    createRedisClient: () => {
      const client = clients.shift();
      assert.ok(client);
      return client;
    },
    intervalMs: 5_000,
    logger,
    targets: [{ label: "rate-limit", redisUrl: "redis://redis.internal:6379/0" }],
  });

  await monitor.checkOnce();
  await monitor.checkOnce();

  assert.equal(warnings.length, 1);
  assert.equal(infos.length, 1);
  assert.equal(infos[0].message, "Redis health monitor target recovered");
  await monitor.stop();
});

test("Redis health reconnect strategy uses bounded exponential backoff", () => {
  const { logger, warnings } = createTestLogger();
  const strategy = createRedisHealthReconnectStrategy(logger);

  assert.equal(strategy(0, new Error("redis down")), 500);
  assert.equal(strategy(3, new Error("redis down")), 4_000);
  assert.equal(strategy(20, new Error("redis down")), 30_000);
  assert.equal(warnings.length, 3);
});
