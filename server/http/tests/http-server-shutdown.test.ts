import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { closeHttpServerForShutdown } from "../../internal/http-server-shutdown";

type WarningEntry = {
  message: string;
  metadata?: Record<string, unknown>;
};

function createLogger() {
  const warnings: WarningEntry[] = [];
  return {
    logger: {
      warn(message: string, metadata?: Record<string, unknown>) {
        warnings.push(metadata === undefined ? { message } : { message, metadata });
      },
    },
    warnings,
  };
}

function listen(server: ReturnType<typeof createServer>): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.equal(typeof address, "object");
      assert.ok(address);
      resolve(`http://127.0.0.1:${(address as AddressInfo).port}`);
    });
  });
}

test("closeHttpServerForShutdown waits for in-flight requests before resolving", async () => {
  const releaseRequestRef: { current: (() => void) | null } = { current: null };
  let markRequestEntered: (() => void) | null = null;
  const requestEntered = new Promise<void>((resolve) => {
    markRequestEntered = resolve;
  });
  const server = createServer((_req, res) => {
    markRequestEntered?.();
    releaseRequestRef.current = () => {
      res.end("ok");
    };
  });

  const { logger } = createLogger();
  const baseUrl = await listen(server);
  const responsePromise = fetch(baseUrl);
  await requestEntered;

  let shutdownResolved = false;
  const shutdownPromise = closeHttpServerForShutdown({ logger, server }).then(() => {
    shutdownResolved = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(shutdownResolved, false);
  const releaseRequest = releaseRequestRef.current;
  assert.ok(releaseRequest);
  releaseRequest();

  const response = await responsePromise;
  assert.equal(await response.text(), "ok");
  await shutdownPromise;
  assert.equal(shutdownResolved, true);
});

test("closeHttpServerForShutdown closes idle keep-alive connections immediately", async () => {
  const { logger } = createLogger();
  const server = createServer((_req, res) => {
    res.end("ok");
  });
  const baseUrl = await listen(server);
  const response = await fetch(baseUrl);
  assert.equal(await response.text(), "ok");

  let closeIdleCalls = 0;
  const originalCloseIdleConnections = server.closeIdleConnections.bind(server);
  server.closeIdleConnections = () => {
    closeIdleCalls += 1;
    originalCloseIdleConnections();
  };

  await closeHttpServerForShutdown({ logger, server });
  assert.ok(closeIdleCalls >= 1);
});

test("closeHttpServerForShutdown resolves immediately for unstarted servers", async () => {
  const { logger, warnings } = createLogger();
  const server = createServer();

  await closeHttpServerForShutdown({ logger, server });
  assert.deepEqual(warnings, []);
});

test("closeHttpServerForShutdown clears idle sweep when server.close throws synchronously", async (t) => {
  const { logger, warnings } = createLogger();
  const closeError = new Error("server close exploded");
  let intervalUnrefCalls = 0;
  const intervalHandle = {
    unref() {
      intervalUnrefCalls += 1;
    },
  } as unknown as ReturnType<typeof setInterval>;
  const clearIntervalMock = t.mock.method(
    globalThis,
    "clearInterval",
    (((handle?: ReturnType<typeof setInterval>) => {
      assert.equal(handle, intervalHandle);
    }) as unknown) as typeof clearInterval,
  );
  t.mock.method(
    globalThis,
    "setInterval",
    (((handler: TimerHandler, timeout?: number) => {
      void handler;
      assert.equal(timeout, 50);
      return intervalHandle;
    }) as unknown) as typeof setInterval,
  );
  const server = {
    listening: true,
    close() {
      throw closeError;
    },
  } as unknown as ReturnType<typeof createServer>;

  await closeHttpServerForShutdown({ logger, server });

  assert.equal(intervalUnrefCalls, 1);
  assert.equal(clearIntervalMock.mock.callCount(), 1);
  assert.deepEqual(warnings, [
    {
      message: "HTTP server close reported an error during graceful shutdown",
      metadata: {
        error: closeError,
      },
    },
  ]);
});
