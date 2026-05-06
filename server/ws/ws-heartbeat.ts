import { WebSocket } from "ws";
import type { RuntimeWsCleanupClient } from "./ws-lifecycle";

export const DEFAULT_RUNTIME_WS_HEARTBEAT_INTERVAL_MS = 30_000;

export type RuntimeWsHeartbeatEntry = {
  activityId: string;
  alive: boolean;
  ws: WebSocket;
};

type RuntimeWsHeartbeatOptions = {
  cleanupClient: RuntimeWsCleanupClient;
  connectedClients: Map<string, WebSocket>;
  heartbeatIntervalMs: number;
  socketEntriesByActivity: Map<string, RuntimeWsHeartbeatEntry>;
};

export function normalizeRuntimeWsHeartbeatIntervalMs(intervalMs: number | undefined): number {
  return Math.max(
    10_000,
    Math.trunc(intervalMs ?? DEFAULT_RUNTIME_WS_HEARTBEAT_INTERVAL_MS),
  );
}

export function startRuntimeWsHeartbeat({
  cleanupClient,
  connectedClients,
  heartbeatIntervalMs,
  socketEntriesByActivity,
}: RuntimeWsHeartbeatOptions): NodeJS.Timeout {
  const heartbeatHandle = setInterval(() => {
    for (const [activityId, ws] of Array.from(connectedClients.entries())) {
      const currentEntry = socketEntriesByActivity.get(activityId);
      if (currentEntry?.ws === ws) {
        continue;
      }

      cleanupClient(activityId, {
        expectedWs: ws,
      });
    }

    for (const entry of Array.from(socketEntriesByActivity.values())) {
      const { activityId, ws } = entry;
      if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
        cleanupClient(activityId, {
          expectedWs: ws,
          clearSession: true,
        });
        continue;
      }

      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      const currentEntry = socketEntriesByActivity.get(activityId);
      if (!currentEntry || currentEntry.ws !== ws) {
        cleanupClient(activityId, {
          expectedWs: ws,
          reason: "heartbeat-entry-mismatch",
        });
        continue;
      }

      if (connectedClients.get(activityId) !== ws) {
        cleanupClient(activityId, {
          expectedWs: ws,
          closeWith: "close",
          reason: "heartbeat-client-map-desync",
        });
        continue;
      }

      if (!currentEntry.alive) {
        cleanupClient(activityId, {
          expectedWs: ws,
          closeWith: "terminate",
          clearSession: true,
          reason: "heartbeat-timeout",
        });
        continue;
      }

      currentEntry.alive = false;
      ws.ping();
    }
  }, heartbeatIntervalMs);
  heartbeatHandle.unref();
  return heartbeatHandle;
}
