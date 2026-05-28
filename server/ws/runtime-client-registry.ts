import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import type { RuntimeTrackedSocketEntry } from "./runtime-manager-types";
import type { RuntimeSocketLifecycleRegistry } from "./runtime-socket-lifecycle-registry";
import {
  isTrackableSocket,
  sanitizeRuntimeWebSocketError,
  type RuntimeWsCleanupClient,
} from "./ws-lifecycle";

type RuntimeClientRegistryOptions = {
  clearNicknameSession: (activityId: string, reason: string) => void;
  lifecycleRegistry: RuntimeSocketLifecycleRegistry;
  logCleanupDiagnostic: (message: string, metadata: Record<string, unknown>) => void;
};

export function createRuntimeClientRegistry({
  clearNicknameSession,
  lifecycleRegistry,
  logCleanupDiagnostic,
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
    return lifecycleRegistry.registerTrackedSocketEntry(activityId, ws, userKey);
  };

  const cleanupClient: RuntimeWsCleanupClient = (
    activityId,
    options = {},
  ) => {
    const currentEntry = lifecycleRegistry.getEntryByActivity(activityId);
    const currentClient = lifecycleRegistry.connectedClientMap.get(activityId);
    const expectedWs = options.expectedWs;
    const targetWs = expectedWs ?? currentEntry?.ws ?? currentClient;
    const cleanupReason = options.reason ?? (options.closeWith ? `client-${options.closeWith}` : "client-cleanup");

    if (!currentEntry && !currentClient && !expectedWs) {
      return false;
    }

    let cleanupCallbackHandled = false;
    if (targetWs) {
      const cleanupCallback = lifecycleRegistry.getCleanupCallback(targetWs);
      if (cleanupCallback) {
        cleanupCallback({
          clearSession: options.clearSession === true,
          reason: cleanupReason,
        });
        cleanupCallbackHandled = true;
      }
      lifecycleRegistry.deregisterActivity(activityId, targetWs);

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
      lifecycleRegistry.deregisterActivity(activityId);
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
    const currentEntry = lifecycleRegistry.getEntryByActivity(activityId);
    if (currentEntry && (!ws || currentEntry.ws === ws)) {
      lifecycleRegistry.deregisterActivity(activityId, currentEntry.ws);
      return;
    }

    if (!currentEntry && (!ws || lifecycleRegistry.connectedClientMap.get(activityId) === ws)) {
      lifecycleRegistry.deregisterActivity(activityId, ws);
    }
  };

  return {
    cleanupClient,
    registerTrackedSocketEntry,
    removeTrackedSocket,
  };
}
