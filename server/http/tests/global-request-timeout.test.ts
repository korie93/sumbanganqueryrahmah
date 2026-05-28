import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createGlobalRequestTimeoutMiddleware } from "../global-request-timeout";
import { runWithRequestDeadline } from "../request-deadline";
import { logger } from "../../lib/logger";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { ERROR_CODES } from "../../../shared/error-codes";

test("global request timeout returns a correlated 504 response and aborts downstream work", async (t) => {
  const warningLogs: Array<{ message: string; payload: unknown }> = [];
  t.mock.method(logger, "warn", (message: string, payload: unknown) => {
    warningLogs.push({ message, payload });
  });

  const captured: { requestAbortSignal?: AbortSignal } = {};
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("x-request-id", "req-timeout-1");
    next();
  });
  app.use(createGlobalRequestTimeoutMiddleware({ timeoutMs: 20 }));
  app.get("/slow", (_req, res) => {
    captured.requestAbortSignal = res.locals.requestAbortSignal as AbortSignal;
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/slow`);
    const payload = await response.json();

    assert.equal(response.status, 504);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, ERROR_CODES.REQUEST_TIMEOUT);
    assert.equal(payload.error.requestId, "req-timeout-1");
    assert.equal(payload.error.details.timeoutMs, 20);
    assert.equal(captured.requestAbortSignal?.aborted, true);
    assert.equal(warningLogs.length, 1);
    assert.equal(warningLogs[0]?.message, "HTTP request exceeded global timeout");
    assert.deepEqual(warningLogs[0]?.payload, {
      requestId: "req-timeout-1",
      method: "GET",
      path: "/slow",
      timeoutMs: 20,
    });
  } finally {
    await stopTestServer(server);
  }
});

test("global request timeout skips websocket upgrade paths", async () => {
  const app = express();
  app.use(createGlobalRequestTimeoutMiddleware({ timeoutMs: 1 }));
  app.get("/ws/health", (_req, res) => {
    res.json({ ok: true });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/ws/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await stopTestServer(server);
  }
});

test("global request timeout owns the response when it aborts an operation deadline first", async (t) => {
  const warningLogs: Array<{ message: string; payload: unknown }> = [];
  t.mock.method(logger, "warn", (message: string, payload: unknown) => {
    warningLogs.push({ message, payload });
  });

  let resolveOutcome: (value: unknown) => void = () => undefined;
  const operationOutcome = new Promise<unknown>((resolve) => {
    resolveOutcome = resolve;
  });
  const app = express();
  app.use(createGlobalRequestTimeoutMiddleware({ timeoutMs: 20 }));
  app.get("/slow-operation", async (_req, res) => {
    const outcome = await runWithRequestDeadline(
      res,
      {
        operationName: "slow-operation",
        timeoutMessage: "Operation timed out.",
        timeoutMs: 200,
      },
      (signal) =>
        new Promise<string>((resolve) => {
          signal.addEventListener("abort", () => resolve("aborted"), { once: true });
        }),
    );
    resolveOutcome(outcome);
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/slow-operation`);
    const payload = await response.json();
    const outcome = await operationOutcome;

    assert.equal(response.status, 504);
    assert.equal(payload.message, "Request timed out.");
    assert.equal(payload.error.code, ERROR_CODES.REQUEST_TIMEOUT);
    assert.equal(payload.error.details.timeoutMs, 20);
    assert.deepEqual(outcome, { timedOut: true });
    assert.deepEqual(warningLogs.map((entry) => entry.message), [
      "HTTP request exceeded global timeout",
    ]);
  } finally {
    await stopTestServer(server);
  }
});
