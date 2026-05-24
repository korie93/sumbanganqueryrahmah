import type { WebSocket } from "ws";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { logger } from "../lib/logger";
import { extractWsActivityId, isActiveWebSocketSession } from "./session-auth";
import {
  firstHeaderValue,
  hasForwardedHeaders,
  isSameOriginWebSocketRequest,
} from "./ws-auth";
import { createRuntimeWsBroadcaster } from "./ws-broadcast";
import { getActivityUserKey } from "./ws-connection-state";
import {
  countRuntimeWebSocketConnections,
  countTrackedUserConnections,
} from "./runtime-connection-limits";
import { parseRuntimeWebSocketHandshakeUrl } from "./runtime-handshake";
import {
  MAX_RUNTIME_WS_CONNECTIONS_PER_USER,
  DEFAULT_RUNTIME_WS_MAX_CONNECTIONS,
  RUNTIME_WS_CLOSE_POLICY_VIOLATION,
  RUNTIME_WS_CLOSE_TRY_AGAIN_LATER,
  type RuntimeManagerOptions,
  type RuntimeSocketCleanupOptions,
  type RuntimeTrackedSocketEntry,
} from "./runtime-manager-types";
import {
  isTrackableSocket,
  sanitizeRuntimeWebSocketError,
  shouldLogRuntimeWebSocketCleanupDiagnostics,
} from "./ws-lifecycle";
import {
  normalizeRuntimeWsHeartbeatIntervalMs,
  startRuntimeWsHeartbeat,
} from "./ws-heartbeat";
import { closeRuntimeWebSocketServerState } from "./runtime-server-close";
import { createRuntimeClientRegistry } from "./runtime-client-registry";
import {
  createRuntimeWsUpgradeRateLimiter,
  readRuntimeWsUpgradeRateLimitKey,
} from "./upgrade-rate-limit";
import { createRuntimeWsMessageRateLimiter } from "./message-rate-limit";

class RuntimeSharedConnectedClientsMap extends Map<string, WebSocket> {
  constructor(private readonly onDeleteActivity: (activityId: string) => void) {
    super();
  }

  delete(activityId: string) {
    const deleted = super.delete(activityId);
    if (deleted) {
      this.onDeleteActivity(activityId);
    }
    return deleted;
  }

  clear() {
    const activityIds = Array.from(this.keys());
    super.clear();
    for (const activityId of activityIds) {
      this.onDeleteActivity(activityId);
    }
  }
}

export function createRuntimeWebSocketManager(options: RuntimeManagerOptions): {
  connectedClients: Map<string, WebSocket>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
} {
  const { wss, storage, secret } = options;
  const trustForwardedHeaders = options.trustForwardedHeaders === true;
  const acceptConnections = options.acceptConnections ?? (() => true);
  const sharedBus = options.sharedBus ?? null;
  let suppressSharedClosePublish = false;
  const publishSharedCloseActivity = (activityId: string, reason: string) => {
    if (!sharedBus || suppressSharedClosePublish) {
      return;
    }

    sharedBus.publish({
      activityId,
      reason,
      type: "closeActivity",
    });
  };
  const connectedClients = options.connectedClients ?? (
    sharedBus
      ? new RuntimeSharedConnectedClientsMap((activityId) =>
        publishSharedCloseActivity(activityId, "client-map-delete"))
      : new Map<string, WebSocket>()
  );
  const heartbeatIntervalMs = normalizeRuntimeWsHeartbeatIntervalMs(options.heartbeatIntervalMs);
  const upgradeRateLimiter = options.upgradeRateLimiter ?? createRuntimeWsUpgradeRateLimiter();
  const messageRateLimiterFactory =
    options.messageRateLimiterFactory ?? (() => createRuntimeWsMessageRateLimiter());
  const maxConnections = Math.max(
    1,
    Math.trunc(Number(options.maxConnections ?? DEFAULT_RUNTIME_WS_MAX_CONNECTIONS) || DEFAULT_RUNTIME_WS_MAX_CONNECTIONS),
  );
  const socketEntriesByActivity = new Map<string, RuntimeTrackedSocketEntry>();
  const socketEntriesByInstance = new WeakMap<WebSocket, RuntimeTrackedSocketEntry>();
  const trackedSockets = new Set<WebSocket>();
  const socketCleanupCallbacks = new WeakMap<WebSocket, (options?: RuntimeSocketCleanupOptions) => void>();
  const logCleanupDiagnostic = (message: string, metadata: Record<string, unknown>) => {
    if (!shouldLogRuntimeWebSocketCleanupDiagnostics()) {
      return;
    }

    logger.debug(message, metadata);
  };
  const clearNicknameSession = (activityId: string, reason: string) =>
    Promise.resolve(storage.clearCollectionNicknameSessionByActivity?.(activityId)).catch((error) => {
      logger.error("Failed to clear nickname session after WebSocket cleanup", {
        activityId,
        operation: "clearCollectionNicknameSessionByActivity",
        reason,
        error: sanitizeRuntimeWebSocketError(error),
      });
    });
  const {
    cleanupClient,
    registerTrackedSocketEntry,
    removeTrackedSocket,
  } = createRuntimeClientRegistry({
    clearNicknameSession,
    connectedClients,
    logCleanupDiagnostic,
    socketCleanupCallbacks,
    socketEntriesByActivity,
    socketEntriesByInstance,
    trackedSockets,
  });
  const broadcastLocalWsMessage = createRuntimeWsBroadcaster({ connectedClients, cleanupClient });
  const broadcastWsMessage = (payload: Record<string, unknown>) => {
    broadcastLocalWsMessage(payload);
    sharedBus?.publish({
      payload,
      type: "broadcast",
    });
  };
  const heartbeatHandle = startRuntimeWsHeartbeat({
    cleanupClient,
    connectedClients,
    heartbeatIntervalMs,
    socketEntriesByActivity,
  });
  const unsubscribeSharedBus = sharedBus?.subscribe((event) => {
    if (event.type === "broadcast") {
      broadcastLocalWsMessage(event.payload);
      return;
    }

    const targetWs = connectedClients.get(event.activityId);
    suppressSharedClosePublish = true;
    try {
      cleanupClient(event.activityId, {
        ...(targetWs ? { expectedWs: targetWs } : {}),
        clearSession: false,
        closeWith: "close",
        reason: event.reason ?? "shared-bus-close",
      });
    } finally {
      suppressSharedClosePublish = false;
    }
  });

  wss.once("close", () => {
    unsubscribeSharedBus?.();
    void sharedBus?.close();
    upgradeRateLimiter.clear();
    suppressSharedClosePublish = true;
    try {
      closeRuntimeWebSocketServerState({
        cleanupClient,
        connectedClients,
        heartbeatHandle,
        socketCleanupCallbacks,
        socketEntriesByActivity,
        trackedSockets,
      });
    } finally {
      suppressSharedClosePublish = false;
    }
  });

  wss.on("connection", async (ws, req) => {
    if (!trustForwardedHeaders && hasForwardedHeaders(req.headers)) {
      logger.warn("WebSocket handshake included forwarded headers without trusted proxy configuration", {
        hasForwardedFor: Boolean(firstHeaderValue(req.headers["x-forwarded-for"])),
        hasForwardedHost: Boolean(firstHeaderValue(req.headers["x-forwarded-host"])),
        hasForwardedProto: Boolean(firstHeaderValue(req.headers["x-forwarded-proto"])),
        trustedProxiesConfigured: false,
      });
    }

    const upgradeRateLimitKey = readRuntimeWsUpgradeRateLimitKey(req, { trustForwardedHeaders });
    if (!upgradeRateLimiter.consume(upgradeRateLimitKey)) {
      logger.warn("WebSocket upgrade rejected by per-IP rate limit", {
        trustedProxiesConfigured: trustForwardedHeaders,
      });
      try {
        ws.close(RUNTIME_WS_CLOSE_TRY_AGAIN_LATER, "rate limited");
      } catch (error) {
        logger.debug("WebSocket close request failed during rate-limit rejection", {
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
      return;
    }

    if (!acceptConnections()) {
      logger.warn("WebSocket connection rejected because runtime storage is not initialized yet", {
        path: req.url || "/ws",
      });
      try {
        ws.close(RUNTIME_WS_CLOSE_TRY_AGAIN_LATER, "storage initializing");
      } catch (error) {
        logger.debug("WebSocket close request failed during startup readiness rejection", {
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
      return;
    }

    if (countRuntimeWebSocketConnections({ connectedClients, trackedSockets }) >= maxConnections) {
      logger.warn("WebSocket connection rejected because the global connection limit was reached", {
        maxConnections,
      });
      try {
        ws.close(RUNTIME_WS_CLOSE_TRY_AGAIN_LATER, "server connection limit reached");
      } catch (error) {
        logger.debug("WebSocket close request failed during global connection limit rejection", {
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
      return;
    }

    let activityId: string | null = null;
    let socketEntry: RuntimeTrackedSocketEntry | null = null;
    let cleanedUp = false;
    let closeRequested = false;
    let nicknameSessionClearQueued = false;
    const messageRateLimiter = messageRateLimiterFactory();

    const markSocketAlive = () => {
      if (cleanedUp) {
        return;
      }

      const currentEntry = socketEntriesByInstance.get(ws) ?? socketEntry;
      if (currentEntry?.ws === ws) {
        currentEntry.alive = true;
      }
    };

    const detachSocketLifecycleHandlers = () => {
      ws.removeListener("message", handleSocketMessage);
      ws.removeListener("pong", markSocketAlive);
      ws.removeListener("close", handleSocketClose);
      ws.removeListener("error", handleSocketError);
      ws.removeListener("unexpected-response", handleSocketUnexpectedResponse);
    };

    const queueNicknameSessionClear = (sessionActivityId: string, reason: string) => {
      if (nicknameSessionClearQueued) {
        return;
      }

      nicknameSessionClearQueued = true;
      void clearNicknameSession(sessionActivityId, reason);
    };

    const cleanupSocket = (options: RuntimeSocketCleanupOptions = {}) => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      socketCleanupCallbacks.delete(ws);
      trackedSockets.delete(ws);
      socketEntriesByInstance.delete(ws);
      detachSocketLifecycleHandlers();

      const sessionActivityId = socketEntry?.activityId ?? activityId;
      if (socketEntry) {
        removeTrackedSocket(socketEntry.activityId, ws);
        socketEntry = null;
      } else if (activityId && connectedClients.get(activityId) === ws) {
        removeTrackedSocket(activityId, ws);
      }

      if (options.clearSession && sessionActivityId) {
        queueNicknameSessionClear(sessionActivityId, options.reason ?? "socket-cleanup");
      }
    };

    const handleSocketClose = () => {
      const closedActivityId = activityId;
      cleanupSocket({
        clearSession: socketEntry !== null,
        reason: "socket-close",
      });
      if (closedActivityId) {
        logger.debug("WebSocket closed", { activityId: closedActivityId });
      }
    };

    const handleSocketError = (error: unknown) => {
      const erroredActivityId = activityId;
      cleanupSocket({
        clearSession: socketEntry !== null,
        reason: "socket-error",
      });
      if (erroredActivityId) {
        logger.debug("WebSocket errored", {
          activityId: erroredActivityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
    };

    const handleSocketUnexpectedResponse = () => {
      const responseActivityId = activityId;
      cleanupSocket({
        clearSession: socketEntry !== null,
        reason: "socket-unexpected-response",
      });
      if (responseActivityId) {
        logCleanupDiagnostic("WebSocket unexpected response cleanup completed", {
          activityId: responseActivityId,
        });
      }
    };

    const closeSocketIfNeeded = (code?: number, reason?: string) => {
      if (closeRequested || !isTrackableSocket(ws)) {
        return;
      }

      closeRequested = true;
      try {
        if (code !== undefined) {
          ws.close(code, reason);
        } else {
          ws.close();
        }
      } catch (error) {
        logger.debug("WebSocket close request failed during cleanup", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
    };

    const handleSocketMessage = () => {
      if (cleanedUp) {
        return;
      }

      if (messageRateLimiter.consume()) {
        return;
      }

      const limitedActivityId = activityId;
      logger.warn("WebSocket message rate limit exceeded", {
        activityId: limitedActivityId,
      });
      cleanupSocket({
        clearSession: socketEntry !== null,
        reason: "message-rate-limit",
      });
      closeSocketIfNeeded(RUNTIME_WS_CLOSE_POLICY_VIOLATION, "message rate limited");
    };

    ws.on("message", handleSocketMessage);
    ws.on("pong", markSocketAlive);
    ws.once("close", handleSocketClose);
    ws.once("error", handleSocketError);
    ws.once("unexpected-response", handleSocketUnexpectedResponse);
    trackedSockets.add(ws);
    socketCleanupCallbacks.set(ws, cleanupSocket);

    const url = parseRuntimeWebSocketHandshakeUrl(req);
    if (!url) {
      cleanupSocket();
      closeSocketIfNeeded(RUNTIME_WS_CLOSE_POLICY_VIOLATION, "malformed handshake URL");
      return;
    }
    if (url.searchParams.has("token")) {
      logger.warn("WebSocket rejected query-string session token", {
        origin: req.headers.origin || null,
      });
      cleanupSocket();
      closeSocketIfNeeded();
      return;
    }

    if (!isSameOriginWebSocketRequest(req, { trustForwardedHeaders })) {
      const origin = firstHeaderValue(req.headers.origin).trim();
      logger.warn(origin
        ? "WebSocket rejected cross-origin handshake"
        : "WebSocket rejected missing-origin handshake", {
        origin: origin || null,
        host: req.headers.host || null,
        trustForwardedHeaders,
      });
      cleanupSocket();
      closeSocketIfNeeded();
      return;
    }

    const token = readAuthSessionTokenFromHeaders(req.headers);

    if (!token) {
      cleanupSocket();
      closeSocketIfNeeded();
      return;
    }

    try {
      activityId = extractWsActivityId(token, secret);
      if (!activityId) {
        cleanupSocket();
        closeSocketIfNeeded();
        return;
      }

      const activity = await storage.getActivityById(activityId);
      if (cleanedUp || !isTrackableSocket(ws)) {
        cleanupSocket();
        return;
      }

      if (!isActiveWebSocketSession(activity)) {
        logger.debug("WebSocket rejected because the session is invalid or expired", {
          activityId,
        });
        cleanupSocket();
        closeSocketIfNeeded();
        return;
      }

      const userKey = getActivityUserKey(activity);
      if (
        userKey
        && countTrackedUserConnections(socketEntriesByActivity, userKey, activityId)
          >= MAX_RUNTIME_WS_CONNECTIONS_PER_USER
      ) {
        logger.warn("WebSocket rejected because the user connection limit was reached", {
          activityId,
          userKey,
          maxConnectionsPerUser: MAX_RUNTIME_WS_CONNECTIONS_PER_USER,
        });
        cleanupSocket();
        closeSocketIfNeeded(RUNTIME_WS_CLOSE_POLICY_VIOLATION, "connection limit reached");
        return;
      }

      const existingEntry = socketEntriesByActivity.get(activityId);
      const existingWs = existingEntry?.ws ?? connectedClients.get(activityId);
      socketEntry = registerTrackedSocketEntry(activityId, ws, userKey);
      markSocketAlive();

      if (cleanedUp || !isTrackableSocket(ws)) {
        cleanupSocket();
        return;
      }

      if (existingWs && existingWs !== ws) {
        cleanupClient(activityId, {
          expectedWs: existingWs,
          closeWith: "close",
        });
      }

      logger.debug("WebSocket connected", { activityId });
    } catch (error) {
      cleanupSocket();
      logger.warn("WebSocket handshake failed", {
        error: sanitizeRuntimeWebSocketError(error),
      });
      closeSocketIfNeeded();
    }
  });

  return {
    connectedClients,
    broadcastWsMessage,
  };
}
