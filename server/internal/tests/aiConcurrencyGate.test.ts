import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test, { type TestContext } from "node:test";
import { createAiConcurrencyGate } from "../aiConcurrencyGate";
import type { AuthenticatedRequest } from "../../auth/guards";

class MockResponse extends EventEmitter {
  statusCode = 200;
  body: unknown = undefined;
  headers = new Map<string, string>();

  status(statusCode: number) {
    this.statusCode = statusCode;
    return this;
  }

  json(payload: unknown) {
    this.body = payload;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }
}

function createRequest(role = "user"): AuthenticatedRequest {
  return {
    user: {
      username: "ai-user",
      role,
      activityId: "activity-ai",
    },
  } as AuthenticatedRequest;
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function interceptQueueTimers(t: TestContext) {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const createdHandles: unknown[] = [];
  const clearedHandles: unknown[] = [];

  t.mock.method(global, "setTimeout", ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const handle = originalSetTimeout(handler, timeout, ...args);
    createdHandles.push(handle);
    return handle;
  }) as typeof global.setTimeout);

  t.mock.method(global, "clearTimeout", ((handle: Parameters<typeof global.clearTimeout>[0]) => {
    clearedHandles.push(handle);
    return originalClearTimeout(handle);
  }) as typeof global.clearTimeout);

  return { createdHandles, clearedHandles };
}

test("AI concurrency gate rejects immediately when queue limit is zero", async () => {
  const gate = createAiConcurrencyGate({
    globalLimit: 1,
    queueLimit: 0,
    queueWaitMs: 1_000,
    roleLimits: {
      user: 1,
      admin: 1,
      superuser: 1,
    },
  });
  const firstRelease = createDeferred();
  const firstResponse = new MockResponse();
  const secondResponse = new MockResponse();
  const handler = gate.withAiConcurrencyGate("chat", async () => {
    await firstRelease.promise;
  });

  const firstRequest = handler(createRequest(), firstResponse as never, undefined as never);
  await Promise.resolve();
  await handler(createRequest(), secondResponse as never, undefined as never);
  firstRelease.resolve();
  await firstRequest;

  assert.equal(secondResponse.statusCode, 429);
  assert.deepEqual(secondResponse.body, {
    message: "AI queue is full. Please retry in a few seconds.",
    gate: {
      globalInFlight: 1,
      globalLimit: 1,
      queueSize: 0,
      queueLimit: 0,
      role: "user",
      roleInFlight: 1,
      roleLimit: 1,
      queueWaitMs: 1_000,
      code: "AI_GATE_QUEUE_FULL",
    },
  });
});

test("AI concurrency gate clears queued work and rejects new work after shutdown", async () => {
  const gate = createAiConcurrencyGate({
    globalLimit: 1,
    queueLimit: 1,
    queueWaitMs: 1_000,
    roleLimits: {
      user: 1,
      admin: 1,
      superuser: 1,
    },
  });
  const firstRelease = createDeferred();
  const firstResponse = new MockResponse();
  const queuedResponse = new MockResponse();
  const postShutdownResponse = new MockResponse();
  const handler = gate.withAiConcurrencyGate("chat", async () => {
    await firstRelease.promise;
  });

  const firstRequest = handler(createRequest(), firstResponse as never, undefined as never);
  const queuedRequest = handler(createRequest(), queuedResponse as never, undefined as never);

  gate.stopAiConcurrencyGate();

  await queuedRequest;
  await handler(createRequest(), postShutdownResponse as never, undefined as never);
  firstRelease.resolve();
  await firstRequest;

  assert.equal(queuedResponse.statusCode, 503);
  assert.deepEqual(queuedResponse.body, {
    message: "AI service is shutting down. Please retry shortly.",
    gate: {
      globalInFlight: 1,
      globalLimit: 1,
      queueSize: 0,
      queueLimit: 1,
      role: "user",
      roleInFlight: 1,
      roleLimit: 1,
      queueWaitMs: 1_000,
      code: "AI_GATE_STOPPED",
    },
  });

  assert.equal(postShutdownResponse.statusCode, 503);
  assert.deepEqual(postShutdownResponse.body, {
    message: "AI service is shutting down. Please retry shortly.",
    gate: {
      globalInFlight: 1,
      globalLimit: 1,
      queueSize: 0,
      queueLimit: 1,
      role: "user",
      roleInFlight: 1,
      roleLimit: 1,
      queueWaitMs: 1_000,
      code: "AI_GATE_STOPPED",
    },
  });
});

test("AI concurrency gate clears a queued timeout when work acquires before the deadline", async (t) => {
  const timers = interceptQueueTimers(t);
  const gate = createAiConcurrencyGate({
    globalLimit: 1,
    queueLimit: 1,
    queueWaitMs: 1_000,
    roleLimits: {
      user: 1,
      admin: 1,
      superuser: 1,
    },
  });
  const releases = [createDeferred(), createDeferred()];
  let handlerCalls = 0;
  const handler = gate.withAiConcurrencyGate("chat", async () => {
    const currentCall = handlerCalls;
    handlerCalls += 1;
    await releases[currentCall].promise;
  });

  const firstResponse = new MockResponse();
  const secondResponse = new MockResponse();
  const firstRequest = handler(createRequest(), firstResponse as never, undefined as never);
  await Promise.resolve();
  const secondRequest = handler(createRequest(), secondResponse as never, undefined as never);
  await Promise.resolve();

  releases[0].resolve();
  await firstRequest;
  await Promise.resolve();

  assert.equal(handlerCalls, 2);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(timers.createdHandles.length, 1);
  assert.equal(
    timers.clearedHandles.filter((handle) => handle === timers.createdHandles[0]).length,
    1,
  );

  releases[1].resolve();
  await secondRequest;
});

test("AI concurrency gate times out queued work once and never runs it after capacity returns", async () => {
  const gate = createAiConcurrencyGate({
    globalLimit: 1,
    queueLimit: 1,
    queueWaitMs: 20,
    roleLimits: {
      user: 1,
      admin: 1,
      superuser: 1,
    },
  });
  const firstRelease = createDeferred();
  let handlerCalls = 0;
  const handler = gate.withAiConcurrencyGate("chat", async () => {
    handlerCalls += 1;
    await firstRelease.promise;
  });

  const firstResponse = new MockResponse();
  const secondResponse = new MockResponse();
  const firstRequest = handler(createRequest(), firstResponse as never, undefined as never);
  await Promise.resolve();
  const secondRequest = handler(createRequest(), secondResponse as never, undefined as never);

  await secondRequest;

  assert.equal(handlerCalls, 1);
  assert.equal(secondResponse.statusCode, 429);
  assert.deepEqual(secondResponse.body, {
    message: "AI queue wait timed out. Please retry.",
    gate: {
      globalInFlight: 1,
      globalLimit: 1,
      queueSize: 0,
      queueLimit: 1,
      role: "user",
      roleInFlight: 1,
      roleLimit: 1,
      queueWaitMs: 20,
      code: "AI_GATE_WAIT_TIMEOUT",
    },
  });

  firstRelease.resolve();
  await firstRequest;
  await Promise.resolve();

  assert.equal(handlerCalls, 1);
});
