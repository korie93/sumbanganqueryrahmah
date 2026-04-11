import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
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
