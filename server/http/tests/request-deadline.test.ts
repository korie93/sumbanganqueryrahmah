import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { runWithRequestDeadline } from "../request-deadline";
import { logger } from "../../lib/logger";
import { ERROR_CODES } from "../../../shared/error-codes";

function createDeadlineResponse(signal?: AbortSignal) {
  const response = {
    headersSent: false,
    locals: signal ? { requestAbortSignal: signal } : {},
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
  };
  return response as unknown as Response & { body?: unknown; statusCode: number };
}

function createTrackedAbortSignal(initiallyAborted = false) {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  let aborted = initiallyAborted;
  const signal = {
    get aborted() {
      return aborted;
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "abort") {
        listeners.add(listener);
      }
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "abort") {
        listeners.delete(listener);
      }
    },
  } as unknown as AbortSignal;

  return {
    signal,
    abort() {
      if (aborted) {
        return;
      }
      aborted = true;
      const event = { type: "abort" } as Event;
      for (const listener of Array.from(listeners)) {
        if (typeof listener === "function") {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function createTimeoutHandle() {
  return {
    unref() {
      return this;
    },
  } as unknown as ReturnType<typeof setTimeout>;
}

test("runWithRequestDeadline forwards global request abort signals to the operation", async () => {
  const upstream = new AbortController();
  const res = createDeadlineResponse(upstream.signal);
  const captured: { operationSignal?: AbortSignal } = {};

  const outcomePromise = runWithRequestDeadline(
    res,
    {
      operationName: "test-operation",
      timeoutMessage: "Timed out.",
      timeoutMs: 5_000,
    },
    (signal) => {
      captured.operationSignal = signal;
      if (signal.aborted) {
        return Promise.resolve("aborted");
      }
      return new Promise<string>((resolve) => {
        signal.addEventListener("abort", () => resolve("aborted"), { once: true });
      });
    },
  );

  upstream.abort();
  const outcome = await outcomePromise;

  assert.deepEqual(outcome, { timedOut: true });
  assert.equal(captured.operationSignal?.aborted, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test("runWithRequestDeadline resolves and cleans listeners when upstream aborts", async (t) => {
  const upstream = createTrackedAbortSignal();
  const res = createDeadlineResponse(upstream.signal);
  const timeoutHandle = createTimeoutHandle();
  const clearedHandles: Array<Parameters<typeof clearTimeout>[0]> = [];
  const captured: { operationSignal?: AbortSignal } = {};

  t.mock.method(
    globalThis,
    "setTimeout",
    (((_handler: TimerHandler, _delay?: number) => timeoutHandle) as unknown) as typeof setTimeout,
  );
  t.mock.method(
    globalThis,
    "clearTimeout",
    (((handle?: Parameters<typeof clearTimeout>[0]) => {
      clearedHandles.push(handle);
    }) as unknown) as typeof clearTimeout,
  );

  const outcomePromise = runWithRequestDeadline(
    res,
    {
      operationName: "test-operation",
      timeoutMessage: "Timed out.",
      timeoutMs: 5_000,
    },
    (signal) => {
      captured.operationSignal = signal;
      return new Promise<string>(() => undefined);
    },
  );

  assert.equal(upstream.listenerCount(), 1);
  upstream.abort();
  const outcome = await outcomePromise;

  assert.deepEqual(outcome, { timedOut: true });
  assert.equal(captured.operationSignal?.aborted, true);
  assert.equal(upstream.listenerCount(), 0);
  assert.deepEqual(clearedHandles, [timeoutHandle]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test("runWithRequestDeadline removes upstream listeners and clears timers when operation rejects", async (t) => {
  const upstream = createTrackedAbortSignal();
  const res = createDeadlineResponse(upstream.signal);
  const timeoutHandle = createTimeoutHandle();
  const clearedHandles: Array<Parameters<typeof clearTimeout>[0]> = [];

  t.mock.method(
    globalThis,
    "setTimeout",
    (((_handler: TimerHandler, _delay?: number) => timeoutHandle) as unknown) as typeof setTimeout,
  );
  t.mock.method(
    globalThis,
    "clearTimeout",
    (((handle?: Parameters<typeof clearTimeout>[0]) => {
      clearedHandles.push(handle);
    }) as unknown) as typeof clearTimeout,
  );

  await assert.rejects(
    runWithRequestDeadline(
      res,
      {
        operationName: "test-operation",
        timeoutMessage: "Timed out.",
        timeoutMs: 5_000,
      },
      async () => {
        throw new Error("operation failed");
      },
    ),
    /operation failed/,
  );

  assert.equal(upstream.listenerCount(), 0);
  assert.deepEqual(clearedHandles, [timeoutHandle]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test("runWithRequestDeadline clears timeout handles when the deadline fires", async (t) => {
  const res = createDeadlineResponse();
  const timeoutHandle = createTimeoutHandle();
  const clearedHandles: Array<Parameters<typeof clearTimeout>[0]> = [];
  const warningLogs: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  const captured: { operationSignal?: AbortSignal } = {};
  let timeoutHandler: (() => void) | undefined;

  t.mock.method(logger, "warn", (message: string, payload?: Record<string, unknown>) => {
    warningLogs.push({ message, payload });
  });
  t.mock.method(
    globalThis,
    "setTimeout",
    (((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      assert.equal(delay, 25);
      if (typeof handler === "function") {
        timeoutHandler = () => {
          (handler as (...timerArgs: unknown[]) => void)(...args);
        };
      }
      return timeoutHandle;
    }) as unknown) as typeof setTimeout,
  );
  t.mock.method(
    globalThis,
    "clearTimeout",
    (((handle?: Parameters<typeof clearTimeout>[0]) => {
      clearedHandles.push(handle);
    }) as unknown) as typeof clearTimeout,
  );

  const outcomePromise = runWithRequestDeadline(
    res,
    {
      operationName: "test-operation",
      timeoutMessage: "Timed out.",
      timeoutMs: 25,
    },
    (signal) => {
      captured.operationSignal = signal;
      return new Promise<string>(() => undefined);
    },
  );

  assert.equal(typeof timeoutHandler, "function");
  timeoutHandler?.();
  const outcome = await outcomePromise;

  assert.deepEqual(outcome, { timedOut: true });
  assert.equal(captured.operationSignal?.aborted, true);
  assert.deepEqual(clearedHandles, [timeoutHandle]);
  assert.equal(res.statusCode, 504);
  assert.deepEqual(res.body, {
    ok: false,
    message: "Timed out.",
    error: {
      code: ERROR_CODES.REQUEST_TIMEOUT,
      message: "Timed out.",
      details: {
        operation: "test-operation",
        timeoutMs: 25,
      },
    },
  });
  assert.deepEqual(warningLogs, [
    {
      message: "HTTP request exceeded deadline",
      payload: {
        operationName: "test-operation",
        timeoutMs: 25,
      },
    },
  ]);
});
