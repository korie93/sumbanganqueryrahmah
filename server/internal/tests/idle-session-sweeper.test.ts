import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { logger } from "../../lib/logger";
import type { UserActivity } from "../../../shared/schema-postgres";
import { runIdleSessionSweeperPass, startIdleSessionSweeper } from "../idle-session-sweeper";

function createSocketDouble() {
  const sentPayloads: string[] = [];
  let closeCalls = 0;

  return {
    socket: {
      readyState: WebSocket.OPEN,
      send: (payload: string) => {
        sentPayloads.push(payload);
      },
      close: () => {
        closeCalls += 1;
      },
    } as unknown as WebSocket,
    sentPayloads,
    getCloseCalls: () => closeCalls,
  };
}

function createActiveActivity(overrides?: Partial<UserActivity>): UserActivity {
  return {
    id: "activity-1",
    userId: "user-1",
    username: "alpha.user",
    role: "user",
    pcName: null,
    browser: null,
    fingerprint: null,
    ipAddress: null,
    loginTime: null,
    lastActivityTime: new Date(),
    isActive: true,
    logoutTime: null,
    logoutReason: null,
    ...overrides,
  };
}

test("runIdleSessionSweeperPass expires stale sessions and closes connected sockets", async () => {
  const now = Date.now();
  const socketDouble = createSocketDouble();
  const connectedClients = new Map<string, WebSocket>([["activity-1", socketDouble.socket]]);
  const expireCalls: Array<{ idleCutoff: Date; idleMinutes: number }> = [];

  await runIdleSessionSweeperPass({
    storage: {
      getActiveActivities: async () => {
        throw new Error("Batch idle sweeper should not load active activities");
      },
      expireIdleActivitySession: async () => {
        throw new Error("Batch idle sweeper should not expire sessions one-by-one");
      },
      expireIdleActivitySessions: async (params) => {
        expireCalls.push(params);
        return [
          createActiveActivity({
            lastActivityTime: new Date(now - 10 * 60 * 1000),
          }),
        ];
      },
    },
    connectedClients,
    getRuntimeSettingsCached: async () => ({
      sessionTimeoutMinutes: 5,
      wsIdleMinutes: 5,
    }),
    defaultSessionTimeoutMinutes: 30,
  });

  assert.equal(expireCalls.length, 1);
  assert.equal(expireCalls[0].idleMinutes, 5);
  assert.equal(socketDouble.getCloseCalls(), 1);
  assert.equal(socketDouble.sentPayloads.length, 1);
  assert.deepEqual(JSON.parse(socketDouble.sentPayloads[0]), {
    type: "idle_timeout",
    reason: "Session expired due to inactivity",
  });
  assert.equal(connectedClients.has("activity-1"), false);
});

test("runIdleSessionSweeperPass leaves active sessions alone when batch expiry returns no expired sessions", async () => {
  const socketDouble = createSocketDouble();
  const connectedClients = new Map<string, WebSocket>([["activity-1", socketDouble.socket]]);
  const expireCalls: Array<{ idleCutoff: Date; idleMinutes: number }> = [];

  await runIdleSessionSweeperPass({
    storage: {
      getActiveActivities: async () => {
        throw new Error("Batch idle sweeper should not load active activities");
      },
      expireIdleActivitySession: async () => {
        throw new Error("Batch idle sweeper should not expire sessions one-by-one");
      },
      expireIdleActivitySessions: async (params) => {
        expireCalls.push(params);
        return [];
      },
    },
    connectedClients,
    getRuntimeSettingsCached: async () => ({
      sessionTimeoutMinutes: 5,
      wsIdleMinutes: 5,
    }),
    defaultSessionTimeoutMinutes: 30,
  });

  assert.equal(expireCalls.length, 1);
  assert.equal(socketDouble.getCloseCalls(), 0);
  assert.equal(socketDouble.sentPayloads.length, 0);
  assert.equal(connectedClients.has("activity-1"), true);
});

test("runIdleSessionSweeperPass clamps explicit zero timeout instead of falling through", async () => {
  const expireCalls: Array<{ idleCutoff: Date; idleMinutes: number }> = [];

  await runIdleSessionSweeperPass({
    storage: {
      getActiveActivities: async () => {
        throw new Error("Batch idle sweeper should not load active activities");
      },
      expireIdleActivitySession: async () => {
        throw new Error("Batch idle sweeper should not expire sessions one-by-one");
      },
      expireIdleActivitySessions: async (params) => {
        expireCalls.push(params);
        return [];
      },
    },
    connectedClients: new Map<string, WebSocket>(),
    getRuntimeSettingsCached: async () => ({
      sessionTimeoutMinutes: 0,
      wsIdleMinutes: 15,
    }),
    defaultSessionTimeoutMinutes: 30,
  });

  assert.equal(expireCalls.length, 1);
  assert.equal(expireCalls[0].idleMinutes, 1);
});

test("runIdleSessionSweeperPass falls back to per-session expiry when batch storage is unavailable", async () => {
  const now = Date.now();
  const socketDouble = createSocketDouble();
  const connectedClients = new Map<string, WebSocket>([["activity-1", socketDouble.socket]]);
  const expireCalls: Array<{ activityId: string; idleCutoff: Date; idleMinutes: number }> = [];

  await runIdleSessionSweeperPass({
    storage: {
      getActiveActivities: async () => [
        createActiveActivity({
          lastActivityTime: new Date(now - 10 * 60 * 1000),
        }),
      ],
      expireIdleActivitySession: async (params) => {
        expireCalls.push(params);
        return createActiveActivity({
          lastActivityTime: new Date(now - 10 * 60 * 1000),
        });
      },
    },
    connectedClients,
    getRuntimeSettingsCached: async () => ({
      sessionTimeoutMinutes: 5,
      wsIdleMinutes: 5,
    }),
    defaultSessionTimeoutMinutes: 30,
  });

  assert.equal(expireCalls.length, 1);
  assert.equal(expireCalls[0].activityId, "activity-1");
  assert.equal(expireCalls[0].idleMinutes, 5);
  assert.equal(socketDouble.getCloseCalls(), 1);
  assert.equal(socketDouble.sentPayloads.length, 1);
  assert.equal(connectedClients.has("activity-1"), false);
});

test("runIdleSessionSweeperPass cleans stale sockets even when idle notification fails", async (t) => {
  const warningLogs: Array<{ message: string; payload: Record<string, unknown> }> = [];
  const healthySocket = createSocketDouble();
  let failingTerminateCalls = 0;
  const failingSocket = {
    readyState: WebSocket.OPEN,
    send: () => {
      throw Object.assign(new Error("raw idle socket send details must not leak"), {
        code: "EPIPE",
      });
    },
    close: () => {
      throw Object.assign(new Error("raw idle socket close details must not leak"), {
        code: "ECONNRESET",
      });
    },
    terminate: () => {
      failingTerminateCalls += 1;
    },
  } as unknown as WebSocket;
  const connectedClients = new Map<string, WebSocket>([
    ["activity-1", failingSocket],
    ["activity-2", healthySocket.socket],
  ]);

  t.mock.method(logger, "warn", (message: string, payload: Record<string, unknown>) => {
    warningLogs.push({ message, payload });
  });

  await runIdleSessionSweeperPass({
    storage: {
      getActiveActivities: async () => {
        throw new Error("Batch idle sweeper should not load active activities");
      },
      expireIdleActivitySession: async () => {
        throw new Error("Batch idle sweeper should not expire sessions one-by-one");
      },
      expireIdleActivitySessions: async () => [
        createActiveActivity({ id: "activity-1" }),
        createActiveActivity({ id: "activity-2" }),
      ],
    },
    connectedClients,
    getRuntimeSettingsCached: async () => ({
      sessionTimeoutMinutes: 5,
      wsIdleMinutes: 5,
    }),
    defaultSessionTimeoutMinutes: 30,
  });

  assert.equal(connectedClients.size, 0);
  assert.equal(failingTerminateCalls, 1);
  assert.equal(healthySocket.getCloseCalls(), 1);
  assert.equal(healthySocket.sentPayloads.length, 1);
  assert.deepEqual(warningLogs, [
    {
      message: "Failed to notify idle WebSocket before cleanup",
      payload: {
        activityId: "activity-1",
        error: {
          code: "EPIPE",
          name: "Error",
        },
      },
    },
    {
      message: "Failed to close idle WebSocket cleanly; terminating",
      payload: {
        activityId: "activity-1",
        error: {
          code: "ECONNRESET",
          name: "Error",
        },
      },
    },
  ]);
  assert.doesNotMatch(JSON.stringify(warningLogs), /raw idle socket/);
});

test("startIdleSessionSweeper resets its running guard after a failed pass", async () => {
  const originalSetInterval = globalThis.setInterval;
  let scheduledHandler: (() => Promise<void>) | null = null;
  let intervalMs: number | undefined;
  let intervalUnrefCalls = 0;
  const intervalHandle = {
    unref() {
      intervalUnrefCalls += 1;
    },
  } as unknown as ReturnType<typeof setInterval>;

  globalThis.setInterval = (((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const intervalCallback = handler as (...callbackArgs: unknown[]) => void | Promise<void>;
    intervalMs = timeout;
    scheduledHandler = async () => {
      await intervalCallback(...args);
    };
    return intervalHandle;
  }) as unknown) as typeof setInterval;

  const runScheduledHandler = async () => {
    const currentHandler = scheduledHandler;
    if (!currentHandler) {
      throw new Error("Idle session sweeper test expected a scheduled interval handler");
    }
    await currentHandler();
  };

  try {
    const connectedClients = new Map<string, WebSocket>();
    let expireCalls = 0;
    const handle = startIdleSessionSweeper({
      storage: {
        getActiveActivities: async () => {
          throw new Error("Batch idle sweeper should not load active activities");
        },
        expireIdleActivitySession: async () => {
          throw new Error("Batch idle sweeper should not expire sessions one-by-one");
        },
        expireIdleActivitySessions: async () => {
          expireCalls += 1;
          if (expireCalls === 1) {
            throw new Error("simulated expiry failure");
          }

          return [];
        },
      },
      connectedClients,
      getRuntimeSettingsCached: async () => ({
        sessionTimeoutMinutes: 5,
        wsIdleMinutes: 5,
      }),
      defaultSessionTimeoutMinutes: 30,
      intervalMs: 25,
    });

    assert.equal(handle, intervalHandle);
    assert.equal(intervalMs, 25);
    assert.equal(intervalUnrefCalls, 1);

    await runScheduledHandler();
    await runScheduledHandler();

    assert.equal(expireCalls, 2);
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
});

test("startIdleSessionSweeper stop clears the interval and blocks late scheduled passes", async (t) => {
  let scheduledHandler: (() => Promise<void>) | null = null;
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
    (((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      const intervalCallback = handler as (...callbackArgs: unknown[]) => void | Promise<void>;
      scheduledHandler = async () => {
        await intervalCallback(...args);
      };
      return intervalHandle;
    }) as unknown) as typeof setInterval,
  );

  const connectedClients = new Map<string, WebSocket>();
  let expireCalls = 0;
  const handle = startIdleSessionSweeper({
    storage: {
      getActiveActivities: async () => {
        throw new Error("Batch idle sweeper should not load active activities");
      },
      expireIdleActivitySession: async () => {
        throw new Error("Batch idle sweeper should not expire sessions one-by-one");
      },
      expireIdleActivitySessions: async () => {
        expireCalls += 1;
        return [];
      },
    },
    connectedClients,
    getRuntimeSettingsCached: async () => ({
      sessionTimeoutMinutes: 5,
      wsIdleMinutes: 5,
    }),
    defaultSessionTimeoutMinutes: 30,
    intervalMs: 25,
  });

  assert.equal(handle, intervalHandle);
  assert.equal(handle.isActive(), true);
  assert.equal(intervalUnrefCalls, 1);

  handle.stop();
  handle.stop();

  assert.equal(handle.isActive(), false);
  assert.equal(clearIntervalMock.mock.callCount(), 1);

  const currentHandler = scheduledHandler as unknown as (() => Promise<void>) | null;
  if (!currentHandler) {
    throw new Error("Idle session sweeper test expected a scheduled interval handler");
  }
  await currentHandler();

  assert.equal(expireCalls, 0);
});
