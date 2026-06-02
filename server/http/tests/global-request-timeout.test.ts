import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import express from "express";
import {
  LONG_OPERATION_REQUEST_TIMEOUTS_MS,
  createGlobalRequestTimeoutMiddleware,
  resolveGlobalRequestTimeoutMs,
} from "../global-request-timeout";
import { runWithRequestDeadline } from "../request-deadline";
import { logger } from "../../lib/logger";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { ERROR_CODES } from "../../../shared/error-codes";

class FakeTimeoutResponse extends EventEmitter {
  locals: Record<string, unknown> = {};
  headersSent = false;
  writableEnded = false;

  getHeader(_name: string) {
    return undefined;
  }

  status(_code: number) {
    return this;
  }

  json(_payload: unknown) {
    return this;
  }
}

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

test("global request timeout clears timers and listeners when response finishes", (t) => {
  const timeoutHandle = {
    unref() {
      return this;
    },
  } as unknown as ReturnType<typeof setTimeout>;
  const clearedHandles: Array<ReturnType<typeof setTimeout>> = [];
  const setTimeoutMock = t.mock.method(
    globalThis,
    "setTimeout",
    (((_handler: TimerHandler, _delay?: number) => timeoutHandle) as unknown) as typeof setTimeout,
  );
  const clearTimeoutMock = t.mock.method(
    globalThis,
    "clearTimeout",
    (((handle?: ReturnType<typeof setTimeout>) => {
      if (handle) {
        clearedHandles.push(handle);
      }
    }) as unknown) as typeof clearTimeout,
  );
  const middleware = createGlobalRequestTimeoutMiddleware({ timeoutMs: 5_000 });
  const response = new FakeTimeoutResponse();
  let nextCalls = 0;

  middleware(
    {
      headers: {},
      method: "GET",
      path: "/api/me",
    } as never,
    response as never,
    () => {
      nextCalls += 1;
    },
  );

  assert.equal(nextCalls, 1);
  assert.equal(setTimeoutMock.mock.callCount(), 1);
  assert.equal(response.listenerCount("finish"), 1);
  assert.equal(response.listenerCount("close"), 1);

  response.emit("finish");

  assert.equal(clearTimeoutMock.mock.callCount(), 1);
  assert.deepEqual(clearedHandles, [timeoutHandle]);
  assert.equal(response.listenerCount("finish"), 0);
  assert.equal(response.listenerCount("close"), 0);
});

test("global request timeout resolves long-operation route budgets by longest prefix", () => {
  assert.equal(
    resolveGlobalRequestTimeoutMs("/api/imports/import-1/analyze", 20),
    LONG_OPERATION_REQUEST_TIMEOUTS_MS.imports,
  );
  assert.equal(
    resolveGlobalRequestTimeoutMs("/api/backups/backup-1/export", 20),
    LONG_OPERATION_REQUEST_TIMEOUTS_MS.backups,
  );
  assert.equal(
    resolveGlobalRequestTimeoutMs("/api/reports/monthly", 20),
    LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports,
  );
  assert.equal(
    resolveGlobalRequestTimeoutMs("/api/collection/monthly-comparison", 20),
    LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports,
  );
  assert.equal(resolveGlobalRequestTimeoutMs("/api/settings", 20), 20);
  assert.equal(
    resolveGlobalRequestTimeoutMs("/api/imports-extra", 20),
    20,
  );
  assert.equal(
    resolveGlobalRequestTimeoutMs("/api/imports/special", 20, [
      { pathPrefix: "/api/imports", timeoutMs: 100 },
      { pathPrefix: "/api/imports/special", timeoutMs: 250 },
    ]),
    250,
  );
});

test("global request timeout uses route-specific budget before aborting", async () => {
  const app = express();
  app.use(createGlobalRequestTimeoutMiddleware({
    timeoutMs: 15,
    routeTimeouts: [
      { pathPrefix: "/api/slow-import", timeoutMs: 80 },
    ],
  }));
  app.get("/api/slow-import", (_req, res) => {
    setTimeout(() => {
      if (!res.headersSent) {
        res.json({ ok: true });
      }
    }, 30).unref();
  });
  app.get("/api/ordinary-slow", (_req, res) => {
    setTimeout(() => {
      if (!res.headersSent) {
        res.json({ ok: true });
      }
    }, 30).unref();
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const longOperationResponse = await fetch(`${baseUrl}/api/slow-import`);
    assert.equal(longOperationResponse.status, 200);
    assert.deepEqual(await longOperationResponse.json(), { ok: true });

    const ordinaryResponse = await fetch(`${baseUrl}/api/ordinary-slow`);
    assert.equal(ordinaryResponse.status, 504);
    const payload = await ordinaryResponse.json();
    assert.equal(payload.error.code, ERROR_CODES.REQUEST_TIMEOUT);
    assert.equal(payload.error.details.timeoutMs, 15);
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
