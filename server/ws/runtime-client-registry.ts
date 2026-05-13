import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import type {
  RuntimeSocketCleanupOptions,
  RuntimeTrackedSocketEntry,
} from "./runtime-manager-types";
import {
  isTrackableSocket,
  sanitizeRuntimeWebSocketError,
  type RuntimeWsCleanupClient,
} from "./ws-lifecycle";

type RuntimeSocketCleanupCallback = (options?: RuntimeSocketCleanupOptions) => void;

type RuntimeClientRegistryOptions = {
  clearNicknameSession: (activityId: string, reason: string) => void;
  connectedClients: Map<string, WebSocket>;
  logCleanupDiagnostic: (message: string, metadata: Record<string, unknown>) => void;
  socketCleanupCallbacks: WeakMap<WebSocket, RuntimeSocketCleanupCallback>;
  socketEntriesByActivity: Map<string, RuntimeTrackedSocketEntry>;
  socketEntriesByInstance: WeakMap<WebSocket, RuntimeTrackedSocketEntry>;
  trackedSockets: Set<WebSocket>;
};

export function createRuntimeClientRegistry({
  clearNicknameSession,
  connectedClients,
  logCleanupDiagnostic,
  socketCleanupCallbacks,
  socketEntriesByActivity,
  socketEntriesByInstance,
  trackedSockets,
}: RuntimeClientRegistryOptions): {
  cleanupClient: RuntimeWsCleanupClient;
  registerTrackedSocketEntry: (
    activityId: string,
    ws: WebSocket,
    userKey: string | null,
  ) => RuntimeTrackedSocketEntry;
  removeTrackedSocket: (activityId: string, ws?: WebSocket) => void;
} {
  const registerTrackedSocketEntry = (
    activityId: string,
    ws: WebSocket,
    userKey: string | null,
  ): RuntimeTrackedSocketEntry => {
    const entry: RuntimeTrackedSocketEntry = {
      activityId,
      ws,
      userKey,
      alive: true,
    };
    socketEntriesByActivity.set(activityId, entry);
    socketEntriesByInstance.set(ws, entry);
    connectedClients.set(activityId, ws);
    return entry;
  };

  const cleanupClient: RuntimeWsCleanupClient = (
    activityId,
    options = {},
  ) => {
    const currentEntry = socketEntriesByActivity.get(activityId);
    const currentClient = connectedClients.get(activityId);
    const expectedWs = options.expectedWs;
    const targetWs = expectedWs ?? currentEntry?.ws ?? currentClient;
    const cleanupReason = options.reason ?? (options.closeWith ? `client-${options.closeWith}` : "client-cleanup");

    if (!currentEntry && !currentClient && !expectedWs) {
      return false;
    }

    let cleanupCallbackHandled = false;
    if (targetWs) {
      const cleanupCallback = socketCleanupCallbacks.get(targetWs);
      if (cleanupCallback) {
        cleanupCallback({
          clearSession: options.clearSession === true,
          reason: cleanupReason,
        });
        cleanupCallbackHandled = true;
      }
      socketCleanupCallbacks.delete(targetWs);
      socketEntriesByInstance.delete(targetWs);
      trackedSockets.delete(targetWs);

      const latestEntry = socketEntriesByActivity.get(activityId);
      if (latestEntry?.ws === targetWs) {
        socketEntriesByActivity.delete(activityId);
      }

      if (connectedClients.get(activityId) === targetWs) {
        connectedClients.delete(activityId);
      }

      if (options.closeWith === "close" && isTrackableSocket(targetWs)) {
        try {
          targetWs.close();
        } catch (error) {
          logger.debug("WebSocket close request failed during runtime cleanup", {
            activityId,
            error: sanitizeRuntimeWebSocketError(error),
          });
        }
      }

      if (options.closeWith === "terminate" && targetWs.readyState === WebSocket.OPEN) {
        targetWs.terminate();
      }
    } else {
      socketEntriesByActivity.delete(activityId);
      connectedClients.delete(activityId);
    }

    if (options.clearSession && !cleanupCallbackHandled) {
      clearNicknameSession(activityId, cleanupReason);
    }

    logCleanupDiagnostic("WebSocket runtime client cleanup completed", {
      activityId,
      reason: cleanupReason,
      clearSession: options.clearSession === true,
    });

    return true;
  };

  const removeTrackedSocket = (activityId: string, ws?: WebSocket) => {
    const currentEntry = socketEntriesByActivity.get(activityId);
    if (currentEntry && (!ws || currentEntry.ws === ws)) {
      socketEntriesByActivity.delete(activityId);
      socketEntriesByInstance.delete(currentEntry.ws);
      connectedClients.delete(activityId);
      return;
    }

    if (!currentEntry && (!ws || connectedClients.get(activityId) === ws)) {
      connectedClients.delete(activityId);
    }
  };

  return {
    cleanupClient,
    registerTrackedSocketEntry,
    removeTrackedSocket,
  };
}
