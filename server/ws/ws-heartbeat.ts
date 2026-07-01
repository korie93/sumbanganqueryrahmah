import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import {
  sanitizeRuntimeWebSocketError,
  type RuntimeWsCleanupClient,
} from "./ws-lifecycle";

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
    let staleClientMapEntries = 0;
    let closedTrackedSockets = 0;
    let mismatchedEntries = 0;
    let desyncedEntries = 0;
    let heartbeatTimeouts = 0;
    let failedPings = 0;

    for (const [activityId, ws] of Array.from(connectedClients.entries())) {
      const currentEntry = socketEntriesByActivity.get(activityId);
      if (currentEntry?.ws === ws) {
        continue;
      }

      staleClientMapEntries += 1;
      cleanupClient(activityId, {
        expectedWs: ws,
        reason: "heartbeat-stale-client-map-entry",
      });
    }

    for (const entry of Array.from(socketEntriesByActivity.values())) {
      const { activityId, ws } = entry;
      if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
        closedTrackedSockets += 1;
        cleanupClient(activityId, {
          expectedWs: ws,
          clearSession: true,
          reason: "heartbeat-closed-socket",
        });
        continue;
      }

      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      const currentEntry = socketEntriesByActivity.get(activityId);
      if (!currentEntry || currentEntry.ws !== ws) {
        mismatchedEntries += 1;
        cleanupClient(activityId, {
          expectedWs: ws,
          reason: "heartbeat-entry-mismatch",
        });
        continue;
      }

      if (connectedClients.get(activityId) !== ws) {
        desyncedEntries += 1;
        cleanupClient(activityId, {
          expectedWs: ws,
          closeWith: "close",
          reason: "heartbeat-client-map-desync",
        });
        continue;
      }

      if (!currentEntry.alive) {
        heartbeatTimeouts += 1;
        cleanupClient(activityId, {
          expectedWs: ws,
          closeWith: "terminate",
          clearSession: true,
          reason: "heartbeat-timeout",
        });
        continue;
      }

      currentEntry.alive = false;
      try {
        ws.ping();
      } catch (error) {
        failedPings += 1;
        cleanupClient(activityId, {
          expectedWs: ws,
          closeWith: "terminate",
          clearSession: true,
          reason: "heartbeat-ping-failed",
        });
        logger.warn("WebSocket heartbeat ping failed; client removed", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
    }

    const staleTotal = staleClientMapEntries
      + closedTrackedSockets
      + mismatchedEntries
      + desyncedEntries
      + heartbeatTimeouts
      + failedPings;
    if (staleTotal > 0) {
      logger.warn("WebSocket heartbeat stale sweep removed clients", {
        staleTotal,
        staleClientMapEntries,
        closedTrackedSockets,
        mismatchedEntries,
        desyncedEntries,
        heartbeatTimeouts,
        failedPings,
      });
    }
  }, heartbeatIntervalMs);
  heartbeatHandle.unref();
  return heartbeatHandle;
}
