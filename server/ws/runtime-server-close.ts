import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import type { RuntimeSocketLifecycleRegistry } from "./runtime-socket-lifecycle-registry";
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
  heartbeatHandle: ReturnType<typeof setInterval>;
  lifecycleRegistry: RuntimeSocketLifecycleRegistry;
}): void {
  const {
    cleanupClient,
    heartbeatHandle,
    lifecycleRegistry,
  } = options;

  clearInterval(heartbeatHandle);
  for (const entry of Array.from(lifecycleRegistry.socketEntriesByActivity.values())) {
    cleanupClient(entry.activityId, {
      expectedWs: entry.ws,
      closeWith: "close",
      clearSession: true,
      reason: "server-close",
    });
  }
  for (const [activityId, ws] of Array.from(lifecycleRegistry.connectedClientMap.entries())) {
    cleanupClient(activityId, {
      expectedWs: ws,
      closeWith: "close",
      clearSession: true,
      reason: "server-close",
    });
  }
  for (const ws of Array.from(lifecycleRegistry.trackedSockets)) {
    lifecycleRegistry.getCleanupCallback(ws)?.({
      reason: "server-close-unregistered",
    });
    if (!isTrackableSocket(ws)) {
      lifecycleRegistry.deregisterSocket(ws);
      continue;
    }

    try {
      ws.close();
    } catch (error) {
      logger.debug("WebSocket close request failed during server shutdown cleanup", {
        error: sanitizeRuntimeWebSocketError(error),
      });
      try {
        ws.terminate();
      } catch (terminateError) {
        logger.debug("WebSocket terminate fallback failed during server shutdown cleanup", {
          error: sanitizeRuntimeWebSocketError(terminateError),
        });
      }
    } finally {
      lifecycleRegistry.deregisterSocket(ws);
    }
  }
  lifecycleRegistry.clearAll();
}
