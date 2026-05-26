import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { startLocalServer } from "../../internal/server-startup";

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

test("startLocalServer rejects EADDRINUSE through startup shutdown flow instead of exiting immediately", async (t) => {
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
