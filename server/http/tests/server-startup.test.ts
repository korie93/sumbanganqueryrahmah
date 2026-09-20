import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import bcrypt from "bcrypt";
import express from "express";
import { startLocalServer } from "../../internal/server-startup";
import { startBackgroundServiceWithHealthSignal } from "../../internal/background-service-health";
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
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const fakeHandle = {
    unrefCalled: false,
    unref() {
      this.unrefCalled = true;
      return this;
    },
  };
  let capturedHandler: (() => void) | null = null;
  let precomputeSetTimeoutCalls = 0;
  let precomputeClearTimeoutCalls = 0;
  const setTimeoutMock = t.mock.method(
    globalThis,
    "setTimeout",
    (((handler: () => void, delayMs?: number) => {
      if (delayMs === 0) {
        precomputeSetTimeoutCalls += 1;
        capturedHandler = handler;
        return fakeHandle as unknown as ReturnType<typeof setTimeout>;
      }

      return originalSetTimeout(handler, delayMs);
    }) as unknown) as typeof setTimeout,
  );
  const clearTimeoutMock = t.mock.method(
    globalThis,
    "clearTimeout",
    (((handle?: ReturnType<typeof setTimeout>) => {
      if (handle === fakeHandle as unknown as ReturnType<typeof setTimeout>) {
        precomputeClearTimeoutCalls += 1;
        return;
      }

      originalClearTimeout(handle);
    }) as unknown) as typeof clearTimeout,
  );

  return {
    clearTimeoutMock,
    fakeHandle,
    getCapturedHandler: () => capturedHandler,
    getPrecomputeClearTimeoutCalls: () => precomputeClearTimeoutCalls,
    getPrecomputeSetTimeoutCalls: () => precomputeSetTimeoutCalls,
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
  const startBackgroundService = t.mock.fn(async () => undefined);
  const backgroundService = startBackgroundServiceWithHealthSignal({
    service: "bcrypt-startup-test-queue",
    failureReason: "TEST_QUEUE_START_FAILED",
    failureDetails: "Test queue failed to start.",
    failureLogMessage: "Test queue failed to start",
    start: startBackgroundService,
    startAfterListening: server,
  });
  t.after(() => backgroundService.stop());

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
  assert.equal(startBackgroundService.mock.callCount(), 0);
  assert.deepEqual(fatalReports, [
    {
      reason: "BCRYPT_RUNTIME_UNAVAILABLE",
      details: "bcrypt runtime self-check failed",
    },
  ]);
});

for (const storageOutcome of ["ready", "failed"] as const) {
  test(`startLocalServer keeps background services gated while storage initializes (${storageOutcome})`, async (t) => {
    resetDummyBcryptHashForTests();
    t.after(() => resetDummyBcryptHashForTests());

    const app = express();
    const server = createServer(app);
    let signalStorageStarted!: () => void;
    const storageStarted = new Promise<void>((resolve) => {
      signalStorageStarted = resolve;
    });
    let resolveStorageInitialization!: () => void;
    let rejectStorageInitialization!: (error: Error) => void;
    const storageInitialization = new Promise<void>((resolve, reject) => {
      resolveStorageInitialization = resolve;
      rejectStorageInitialization = reject;
    });
    let storageReady = false;
    const startBackgroundService = t.mock.fn(async () => {
      assert.equal(storageReady, true);
      assert.equal(server.listening, true);
    });
    const backgroundService = startBackgroundServiceWithHealthSignal({
      service: `storage-${storageOutcome}-startup-test-queue`,
      failureReason: "TEST_QUEUE_START_FAILED",
      failureDetails: "Test queue failed to start.",
      failureLogMessage: "Test queue failed to start",
      start: startBackgroundService,
      startAfterListening: server,
    });

    const startup = startLocalServer({
      app,
      server,
      storage: {
        init: async () => {
          signalStorageStarted();
          await storageInitialization;
          storageReady = true;
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
      notifyFatalStartup: () => undefined,
      port: 0,
      host: "127.0.0.1",
    });

    try {
      // Fail promptly if an earlier startup check rejects instead of waiting
      // indefinitely for the storage stub to be called.
      await Promise.race([storageStarted, startup]);
      assert.equal(storageReady, false);
      assert.equal(server.listening, false);
      assert.equal(startBackgroundService.mock.callCount(), 0);

      if (storageOutcome === "failed") {
        const rejectedStartup = assert.rejects(startup, /test storage initialization failed/);
        rejectStorageInitialization(new Error("test storage initialization failed"));
        await rejectedStartup;
        assert.equal(server.listening, false);
        assert.equal(startBackgroundService.mock.callCount(), 0);
      } else {
        resolveStorageInitialization();
        await startup;
        assert.equal(storageReady, true);
        assert.equal(server.listening, true);
        assert.equal(startBackgroundService.mock.callCount(), 1);
      }
    } finally {
      backgroundService.stop();
      resolveStorageInitialization();
      await startup.catch(() => undefined);
      if (server.listening) {
        await close(server);
      }
    }
  });
}

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

    assert.equal(timerMocks.getPrecomputeSetTimeoutCalls(), 1);
    assert.equal(timerMocks.fakeHandle.unrefCalled, true);
    assert.equal(typeof timerMocks.getCapturedHandler(), "function");

    await close(server);
    assert.equal(timerMocks.getPrecomputeClearTimeoutCalls(), 1);

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
