import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
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
  assert.deepEqual(JSON.parse(socketDouble.sentPayloads[0]), {
    type: "idle_timeout",
    reason: "Session expired due to inactivity",
  });
  assert.equal(connectedClients.has("activity-1"), false);
});

test("runIdleSessionSweeperPass leaves active sessions alone when atomic expiry rejects stale list data", async () => {
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
        return undefined;
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
    const now = Date.now();
    const connectedClients = new Map<string, WebSocket>();
    let expireCalls = 0;
    const handle = startIdleSessionSweeper({
      storage: {
        getActiveActivities: async () => [
          createActiveActivity({
            lastActivityTime: new Date(now - 10 * 60 * 1000),
          }),
        ],
        expireIdleActivitySession: async () => {
          expireCalls += 1;
          if (expireCalls === 1) {
            throw new Error("simulated expiry failure");
          }

          return undefined;
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
