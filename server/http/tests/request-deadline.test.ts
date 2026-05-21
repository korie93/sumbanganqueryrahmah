import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { runWithRequestDeadline } from "../request-deadline";

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
