import assert from "node:assert/strict";
import test from "node:test";
import {
  createRedisRuntimeWsSharedBus,
  createRuntimeWsRedisReconnectStrategy,
} from "../redis-runtime-shared-bus";
import type { RuntimeWsSharedBusEvent } from "../runtime-shared-bus";

class FakeRedisPubSubClient {
  connected = false;
  published: Array<{ channel: string; message: string }> = [];
  subscriptions = new Map<string, (message: string) => void>();
  quitCalls = 0;
  private readonly errorListeners: Array<(error: unknown) => void> = [];

  constructor(
    private readonly options: {
      connectGate?: Promise<void>;
    } = {},
  ) {}

  async connect() {
    await this.options.connectGate;
    this.connected = true;
  }

  duplicate() {
    return this;
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    if (event === "error") {
      this.errorListeners.push(handler);
    }
    return undefined;
  }

  emitError(error: unknown) {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  async publish(channel: string, message: string) {
    this.published.push({ channel, message });
    return 1;
  }

  async quit() {
    this.quitCalls += 1;
    this.connected = false;
  }

  async subscribe(channel: string, handler: (message: string) => void) {
    this.subscriptions.set(channel, handler);
  }

  async unsubscribe(channel: string) {
    this.subscriptions.delete(channel);
  }
}

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

test("Redis runtime WebSocket shared bus publishes serialized events", async () => {
  const client = new FakeRedisPubSubClient();
  const bus = createRedisRuntimeWsSharedBus({
    createRedisClient: () => client,
    instanceId: "instance-a",
    redisUrl: "redis://redis.internal:6379/0",
  });

  bus.publish({
    payload: { type: "ping" },
    type: "broadcast",
  });
  await flushAsyncWork();

  assert.equal(client.connected, true);
  assert.equal(client.published.length, 1);
  assert.match(client.published[0].message, /"originId":"instance-a"/);
  await bus.close();
  assert.equal(client.quitCalls, 1);
});

test("Redis runtime WebSocket shared bus receives remote events and ignores same-origin events", async () => {
  const client = new FakeRedisPubSubClient();
  const bus = createRedisRuntimeWsSharedBus({
    createRedisClient: () => client,
    instanceId: "instance-a",
    redisUrl: "redis://redis.internal:6379/0",
  });
  const received: RuntimeWsSharedBusEvent[] = [];

  bus.subscribe((event) => {
    received.push(event);
  });
  await flushAsyncWork();

  const maybeHandler = client.subscriptions.values().next().value;
  assert.equal(typeof maybeHandler, "function");
  const handler = maybeHandler as (message: string) => void;
  handler(JSON.stringify({
    id: "same-origin",
    originId: "instance-a",
    payload: { type: "ignored" },
    type: "broadcast",
  }));
  handler(JSON.stringify({
    activityId: "activity-1",
    id: "remote-close",
    originId: "instance-b",
    reason: "logout",
    type: "closeActivity",
  }));

  assert.deepEqual(received, [{
    activityId: "activity-1",
    id: "remote-close",
    originId: "instance-b",
    reason: "logout",
    type: "closeActivity",
  }]);
  await bus.close();
});

test("Redis runtime WebSocket shared bus ignores late client errors after close", async () => {
  const warnings: unknown[] = [];
  const client = new FakeRedisPubSubClient();
  const bus = createRedisRuntimeWsSharedBus({
    createRedisClient: () => client,
    instanceId: "instance-a",
    logger: {
      debug: () => undefined,
      warn: (...args: unknown[]) => {
        warnings.push(args);
      },
    },
    redisUrl: "redis://redis.internal:6379/0",
  });

  bus.publish({
    payload: { type: "ping" },
    type: "broadcast",
  });
  await flushAsyncWork();
  await bus.close();
  client.emitError(new Error("late redis error after close"));

  assert.equal(warnings.length, 0);
});

test("Redis runtime WebSocket shared bus skips pending publishes after close", async () => {
  const connectGate = createDeferred();
  const client = new FakeRedisPubSubClient({ connectGate: connectGate.promise });
  const bus = createRedisRuntimeWsSharedBus({
    createRedisClient: () => client,
    instanceId: "instance-a",
    redisUrl: "redis://redis.internal:6379/0",
  });

  bus.publish({
    payload: { type: "ping" },
    type: "broadcast",
  });
  const closePromise = bus.close();
  connectGate.resolve();
  await closePromise;
  await flushAsyncWork();

  assert.equal(client.published.length, 0);
  assert.equal(client.quitCalls, 1);
});

test("Redis runtime WebSocket shared bus reconnect strategy uses bounded exponential backoff", () => {
  const warnings: unknown[] = [];
  const strategy = createRuntimeWsRedisReconnectStrategy({
    debug: () => undefined,
    warn: (...args: unknown[]) => {
      warnings.push(args);
    },
  });

  assert.equal(strategy(0, new Error("redis down")), 500);
  assert.equal(strategy(3, new Error("redis down")), 4_000);
  assert.equal(strategy(20, new Error("redis down")), 30_000);
  assert.equal(warnings.length, 3);
});
