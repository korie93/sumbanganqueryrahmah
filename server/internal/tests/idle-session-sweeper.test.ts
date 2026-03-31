import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { runIdleSessionSweeperPass } from "../idle-session-sweeper";

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

test("runIdleSessionSweeperPass expires stale sessions and closes connected sockets", async () => {
  const now = Date.now();
  const socketDouble = createSocketDouble();
  const connectedClients = new Map<string, WebSocket>([["activity-1", socketDouble.socket]]);
  const expireCalls: Array<{ activityId: string; idleCutoff: Date; idleMinutes: number }> = [];

  await runIdleSessionSweeperPass({
    storage: {
      getActiveActivities: async () => [
        {
          id: "activity-1",
          username: "alpha.user",
          lastActivityTime: new Date(now - 10 * 60 * 1000),
        } as any,
      ],
      expireIdleActivitySession: async (params) => {
        expireCalls.push(params);
        return {
          id: "activity-1",
          username: "alpha.user",
          lastActivityTime: new Date(now - 10 * 60 * 1000),
        } as any;
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
        {
          id: "activity-1",
          username: "alpha.user",
          lastActivityTime: new Date(now - 10 * 60 * 1000),
        } as any,
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
