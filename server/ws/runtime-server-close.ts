import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import type {
  RuntimeSocketCleanupOptions,
  RuntimeTrackedSocketEntry,
} from "./runtime-manager-types";
import {
  isTrackableSocket,
  sanitizeRuntimeWebSocketError,
} from "./ws-lifecycle";

type RuntimeCleanupClient = (
  activityId: string,
  options?: {
    expectedWs?: WebSocket;
    closeWith?: "close" | "terminate";
    clearSession?: boolean;
    reason?: string;
  },
) => boolean;

export function closeRuntimeWebSocketServerState(options: {
  cleanupClient: RuntimeCleanupClient;
  connectedClients: Map<string, WebSocket>;
  heartbeatHandle: ReturnType<typeof setInterval>;
  socketCleanupCallbacks: WeakMap<WebSocket, (options?: RuntimeSocketCleanupOptions) => void>;
  socketEntriesByActivity: Map<string, RuntimeTrackedSocketEntry>;
  trackedSockets: Set<WebSocket>;
}): void {
  const {
    cleanupClient,
    connectedClients,
    heartbeatHandle,
    socketCleanupCallbacks,
    socketEntriesByActivity,
    trackedSockets,
  } = options;

  clearInterval(heartbeatHandle);
  for (const entry of Array.from(socketEntriesByActivity.values())) {
    cleanupClient(entry.activityId, {
      expectedWs: entry.ws,
      closeWith: "close",
      clearSession: true,
      reason: "server-close",
    });
  }
  for (const [activityId, ws] of Array.from(connectedClients.entries())) {
    cleanupClient(activityId, {
      expectedWs: ws,
      closeWith: "close",
      clearSession: true,
      reason: "server-close",
    });
  }
  for (const ws of Array.from(trackedSockets)) {
    socketCleanupCallbacks.get(ws)?.({
      reason: "server-close-unregistered",
    });
    if (!isTrackableSocket(ws)) {
      continue;
    }

    try {
      ws.close();
    } catch (error) {
      logger.debug("WebSocket close request failed during server shutdown cleanup", {
        error: sanitizeRuntimeWebSocketError(error),
      });
    }
  }
  connectedClients.clear();
  socketEntriesByActivity.clear();
  trackedSockets.clear();
}
