import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import bcrypt from "bcrypt";
import express from "express";
import { startLocalServer } from "../../internal/server-startup";
import { resetDummyBcryptHashForTests } from "../../auth/passwords";

function listen(server: ReturnType<typeof createServer>, port = 0) {
  return new Promise<number>((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      assert.equal(typeof address, "object");
      assert.ok(address);
      resolve((address as AddressInfo).port);
    });
  });
}

function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function installPrecomputeTimerMocks(t: TestContext) {
  const fakeHandle = {
    unrefCalled: false,
    unref() {
      this.unrefCalled = true;
      return this;
    },
  };
  let capturedHandler: (() => void) | null = null;
  const setTimeoutMock = t.mock.method(
    globalThis,
    "setTimeout",
    (((handler: () => void, delayMs?: number) => {
      assert.equal(delayMs, 0);
      capturedHandler = handler;
      return fakeHandle as unknown as ReturnType<typeof setTimeout>;
    }) as unknown) as typeof setTimeout,
  );
  const clearTimeoutMock = t.mock.method(
    globalThis,
    "clearTimeout",
    (((handle?: ReturnType<typeof setTimeout>) => {
      assert.equal(handle, fakeHandle as unknown as ReturnType<typeof setTimeout>);
    }) as unknown) as typeof clearTimeout,
  );

  return {
    clearTimeoutMock,
    fakeHandle,
    getCapturedHandler: () => capturedHandler,
    setTimeoutMock,
  };
}

test("startLocalServer fails startup before listening when bcrypt runtime self-check fails", async (t) => {
  resetDummyBcryptHashForTests();
  t.after(() => {
    resetDummyBcryptHashForTests();
  });

  t.mock.method(bcrypt, "hash", async () => "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7z6xUfIjm6");
  t.mock.method(bcrypt, "compare", async () => false);

  const app = express();
  const server = createServer(app);
  const fatalReports: Array<{ reason: string; details?: string }> = [];
  let storageInitCalls = 0;

  await assert.rejects(
    startLocalServer({
      app,
      server,
      storage: {
        init: async () => {
          storageInitCalls += 1;
        },
        getActiveActivities: async () => [],
        expireIdleActivitySession: async () => undefined,
      },
      connectedClients: new Map(),
      getRuntimeSettingsCached: async () => ({
        sessionTimeoutMinutes: 30,
        wsIdleMinutes: 30,
      }),
      defaultSessionTimeoutMinutes: 30,
      aiPrecomputeOnStart: false,
      categoryStatsService: {
        warmCategoryStats: async () => ({ skipped: true, computeKeys: 0 }),
      },
      notifyFatalStartup: (reason, details) => {
        fatalReports.push(details === undefined ? { reason } : { reason, details });
      },
      port: 0,
      host: "127.0.0.1",
    }),
    (error: unknown) => {
      assert.equal((error as { startupReason?: string }).startupReason, "BCRYPT_RUNTIME_UNAVAILABLE");
      assert.match(error instanceof Error ? error.message : String(error), /bcrypt runtime self-check failed/i);
      return true;
    },
  );

  assert.equal(server.listening, false);
  assert.equal(storageInitCalls, 0);
  assert.deepEqual(fatalReports, [
    {
      reason: "BCRYPT_RUNTIME_UNAVAILABLE",
      details: "bcrypt runtime self-check failed",
    },
  ]);
});

test("startLocalServer cancels pending category precompute when server closes first", async (t) => {
  resetDummyBcryptHashForTests();
  t.after(() => {
    resetDummyBcryptHashForTests();
  });

  const timerMocks = installPrecomputeTimerMocks(t);
  const app = express();
  const server = createServer(app);
  let warmCategoryStatsCalls = 0;

  try {
    await startLocalServer({
      app,
      server,
      storage: {
        init: async () => undefined,
        getActiveActivities: async () => [],
        expireIdleActivitySession: async () => undefined,
      },
      connectedClients: new Map(),
      getRuntimeSettingsCached: async () => ({
        sessionTimeoutMinutes: 30,
        wsIdleMinutes: 30,
      }),
      defaultSessionTimeoutMinutes: 30,
      aiPrecomputeOnStart: true,
      categoryStatsService: {
        warmCategoryStats: async () => {
          warmCategoryStatsCalls += 1;
          return { skipped: true, computeKeys: 0 };
        },
      },
      notifyFatalStartup: () => undefined,
      port: 0,
      host: "127.0.0.1",
    });

    assert.equal(timerMocks.setTimeoutMock.mock.callCount(), 1);
    assert.equal(timerMocks.fakeHandle.unrefCalled, true);
    assert.equal(typeof timerMocks.getCapturedHandler(), "function");

    await close(server);
    assert.equal(timerMocks.clearTimeoutMock.mock.callCount(), 1);

    timerMocks.getCapturedHandler()?.();
    await Promise.resolve();
    assert.equal(warmCategoryStatsCalls, 0);
  } finally {
    if (server.listening) {
      await close(server);
    }
  }
});

test("startLocalServer rejects EADDRINUSE through startup shutdown flow instead of exiting immediately", async (t) => {
  resetDummyBcryptHashForTests();
  t.after(() => {
    resetDummyBcryptHashForTests();
  });

  const blocker = createServer((_req, res) => {
    res.end("busy");
  });
  const port = await listen(blocker);
  const app = express();
  const server = createServer(app);
  const fatalReports: Array<{ reason: string; details?: string }> = [];
  let webSocketReadyCalls = 0;
  const exitMock = t.mock.method(
    process,
    "exit",
    ((code?: string | number | null) => {
      throw new Error(`process.exit(${String(code)})`);
    }) as typeof process.exit,
  );

  try {
    await assert.rejects(
      startLocalServer({
        app,
        server,
        storage: {
          init: async () => undefined,
          getActiveActivities: async () => [],
          expireIdleActivitySession: async () => undefined,
        },
        connectedClients: new Map(),
        getRuntimeSettingsCached: async () => ({
          sessionTimeoutMinutes: 30,
          wsIdleMinutes: 30,
        }),
        defaultSessionTimeoutMinutes: 30,
        aiPrecomputeOnStart: false,
        categoryStatsService: {
          warmCategoryStats: async () => ({ skipped: true, computeKeys: 0 }),
        },
        notifyFatalStartup: (reason, details) => {
          fatalReports.push(details === undefined ? { reason } : { reason, details });
        },
        markWebSocketConnectionsReady: () => {
          webSocketReadyCalls += 1;
        },
        port,
        host: "127.0.0.1",
      }),
      (error: unknown) => {
        assert.equal((error as { startupReason?: string }).startupReason, "EADDRINUSE");
        assert.match(error instanceof Error ? error.message : String(error), /already in use/);
        return true;
      },
    );

    assert.equal(exitMock.mock.callCount(), 0);
    assert.equal(webSocketReadyCalls, 0);
    assert.deepEqual(fatalReports, [
      { reason: "EADDRINUSE", details: `Port ${port} is already in use` },
    ]);
  } finally {
    if (server.listening) {
      await close(server);
    }
    await close(blocker);
  }
});
