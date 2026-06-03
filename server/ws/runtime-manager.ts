import type { RawData, WebSocket } from "ws";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { logger } from "../lib/logger";
import { internalMetrics } from "../internal/metrics";
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
  DEFAULT_RUNTIME_WS_MAX_CONNECTIONS_PER_IP,
  DEFAULT_RUNTIME_WS_MAX_MESSAGE_BYTES,
  DEFAULT_RUNTIME_WS_PAYLOAD_WINDOW_BYTES,
  DEFAULT_RUNTIME_WS_PAYLOAD_WINDOW_MS,
  DEFAULT_RUNTIME_WS_LARGE_MESSAGE_WARN_BYTES,
  RUNTIME_WS_CLOSE_GOING_AWAY,
  RUNTIME_WS_CLOSE_MESSAGE_TOO_BIG,
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
  RuntimeSocketLifecycleRegistry,
  type RuntimeSocketLifecycleSnapshot,
} from "./runtime-socket-lifecycle-registry";
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

function resolveRawMessageByteLength(message: RawData): number {
  if (typeof message === "string") {
    return Buffer.byteLength(message, "utf8");
  }
  if (Buffer.isBuffer(message)) {
    return message.byteLength;
  }
  if (Array.isArray(message)) {
    return message.reduce((total, chunk) => total + chunk.byteLength, 0);
  }
  if (message instanceof ArrayBuffer) {
    return message.byteLength;
  }
  return Buffer.byteLength(String(message), "utf8");
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.trunc(numericValue)
    : fallback;
}

export function createRuntimeWebSocketManager(options: RuntimeManagerOptions): {
  connectedClients: Map<string, WebSocket>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
  getLifecycleSnapshot: () => RuntimeSocketLifecycleSnapshot;
} {
  const { wss, storage, secret } = options;
  const trustForwardedHeaders = options.trustForwardedHeaders === true;
  const acceptConnections = options.acceptConnections ?? (() => true);
  const isShuttingDown = options.isShuttingDown ?? (() => false);
  const sharedBus = options.sharedBus ?? null;
  const metrics = options.metrics ?? internalMetrics;
  const now = options.now ?? Date.now;
  let suppressSharedClosePublishDepth = 0;
  const isSharedClosePublishSuppressed = () => suppressSharedClosePublishDepth > 0;
  const withSharedClosePublishSuppressed = (callback: () => void) => {
    suppressSharedClosePublishDepth += 1;
    try {
      callback();
    } finally {
      suppressSharedClosePublishDepth = Math.max(0, suppressSharedClosePublishDepth - 1);
    }
  };
  const publishSharedCloseActivity = (activityId: string, reason: string) => {
    if (!sharedBus || isSharedClosePublishSuppressed()) {
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
  const maxConnections = normalizePositiveInteger(options.maxConnections, DEFAULT_RUNTIME_WS_MAX_CONNECTIONS);
  const maxConnectionsPerIp = normalizePositiveInteger(
    options.maxConnectionsPerIp,
    DEFAULT_RUNTIME_WS_MAX_CONNECTIONS_PER_IP,
  );
  const largeMessageWarnBytes = normalizePositiveInteger(
    options.largeMessageWarnBytes,
    DEFAULT_RUNTIME_WS_LARGE_MESSAGE_WARN_BYTES,
  );
  const maxMessageBytes = normalizePositiveInteger(options.maxMessageBytes, DEFAULT_RUNTIME_WS_MAX_MESSAGE_BYTES);
  const maxPayloadWindowBytes = normalizePositiveInteger(
    options.maxPayloadWindowBytes,
    DEFAULT_RUNTIME_WS_PAYLOAD_WINDOW_BYTES,
  );
  const payloadWindowMs = normalizePositiveInteger(options.payloadWindowMs, DEFAULT_RUNTIME_WS_PAYLOAD_WINDOW_MS);
  const lifecycleRegistry = new RuntimeSocketLifecycleRegistry(connectedClients);
  const activeConnectionCountByIp = new Map<string, number>();
  const tryReserveActiveIpConnection = (ipKey: string): boolean => {
    const currentCount = activeConnectionCountByIp.get(ipKey) ?? 0;
    if (currentCount >= maxConnectionsPerIp) {
      return false;
    }
    activeConnectionCountByIp.set(ipKey, currentCount + 1);
    return true;
  };
  const releaseReservedIpConnection = (ipKey: string): void => {
    const currentCount = activeConnectionCountByIp.get(ipKey) ?? 0;
    if (currentCount <= 1) {
      activeConnectionCountByIp.delete(ipKey);
      return;
    }
    activeConnectionCountByIp.set(ipKey, currentCount - 1);
  };
  const { socketEntriesByActivity, trackedSockets } = lifecycleRegistry;
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
    lifecycleRegistry,
    logCleanupDiagnostic,
  });
  const broadcastLocalWsMessage = createRuntimeWsBroadcaster({ connectedClients, cleanupClient, now });
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
    withSharedClosePublishSuppressed(() => {
      cleanupClient(event.activityId, {
        ...(targetWs ? { expectedWs: targetWs } : {}),
        clearSession: false,
        closeWith: "close",
        reason: event.reason ?? "shared-bus-close",
      });
    });
  });

  wss.once("close", () => {
    unsubscribeSharedBus?.();
    void sharedBus?.close();
    upgradeRateLimiter.clear();
    activeConnectionCountByIp.clear();
    withSharedClosePublishSuppressed(() => {
      closeRuntimeWebSocketServerState({
        cleanupClient,
        heartbeatHandle,
        lifecycleRegistry,
      });
    });
  });

  wss.on("connection", async (ws, req) => {
    if (isShuttingDown()) {
      logger.warn("WebSocket connection rejected because server shutdown is in progress", {
        path: req.url || "/ws",
      });
      try {
        ws.close(RUNTIME_WS_CLOSE_GOING_AWAY, "server shutting down");
      } catch (error) {
        logger.debug("WebSocket close request failed during shutdown rejection", {
          error: sanitizeRuntimeWebSocketError(error),
        });
        try {
          ws.terminate();
        } catch (terminateError) {
          logger.debug("WebSocket terminate fallback failed during shutdown rejection", {
            error: sanitizeRuntimeWebSocketError(terminateError),
          });
        }
      }
      return;
    }

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

    if (!tryReserveActiveIpConnection(upgradeRateLimitKey)) {
      logger.warn("WebSocket connection rejected because the per-IP connection limit was reached", {
        maxConnectionsPerIp,
        trustedProxiesConfigured: trustForwardedHeaders,
      });
      try {
        ws.close(RUNTIME_WS_CLOSE_TRY_AGAIN_LATER, "ip connection limit reached");
      } catch (error) {
        logger.debug("WebSocket close request failed during per-IP connection limit rejection", {
          error: sanitizeRuntimeWebSocketError(error),
        });
        try {
          ws.terminate();
        } catch (terminateError) {
          logger.debug("WebSocket terminate fallback failed during per-IP connection limit rejection", {
            error: sanitizeRuntimeWebSocketError(terminateError),
          });
        }
      }
      return;
    }

    let activityId: string | null = null;
    let socketEntry: RuntimeTrackedSocketEntry | null = null;
    let cleanedUp = false;
    let closeRequested = false;
    let nicknameSessionClearQueued = false;
    let payloadWindowStartedAt = now();
    let payloadWindowBytes = 0;
    const messageRateLimiter = messageRateLimiterFactory();
    let activeIpConnectionReleased = false;

    const releaseActiveIpConnection = () => {
      if (activeIpConnectionReleased) {
        return;
      }

      activeIpConnectionReleased = true;
      releaseReservedIpConnection(upgradeRateLimitKey);
    };

    const markSocketAlive = () => {
      if (cleanedUp) {
        return;
      }

      const currentEntry = lifecycleRegistry.getEntryBySocket(ws) ?? socketEntry;
      if (currentEntry?.ws === ws) {
        currentEntry.alive = true;
      }
    };

    const detachSocketLifecycleHandlers = () => {
      ws.removeListener("message", handleSocketMessage);
      ws.removeListener("pong", markSocketAlive);
      ws.removeListener("close", handleSocketClose);
      ws.removeListener("error", handleSocketError);
      ws.removeAllListeners();
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

      const sessionActivityId = socketEntry?.activityId ?? activityId;
      cleanedUp = true;

      try {
        detachSocketLifecycleHandlers();
        if (socketEntry) {
          removeTrackedSocket(socketEntry.activityId, ws);
        } else if (activityId && connectedClients.get(activityId) === ws) {
          removeTrackedSocket(activityId, ws);
        }
      } catch (error) {
        logger.debug("WebSocket lifecycle handler detach failed during cleanup", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
      } finally {
        lifecycleRegistry.deregisterSocket(ws);
        releaseActiveIpConnection();
        socketEntry = null;
        payloadWindowBytes = 0;
        payloadWindowStartedAt = now();
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
        try {
          ws.terminate();
        } catch (terminateError) {
          logger.debug("WebSocket terminate fallback failed during cleanup", {
            activityId,
            error: sanitizeRuntimeWebSocketError(terminateError),
          });
        }
      }
    };

    const consumePayloadWindow = (messageBytes: number): boolean => {
      const currentTime = now();
      if (currentTime - payloadWindowStartedAt >= payloadWindowMs) {
        payloadWindowStartedAt = currentTime;
        payloadWindowBytes = 0;
      }

      payloadWindowBytes += messageBytes;
      return payloadWindowBytes <= maxPayloadWindowBytes;
    };

    const handleSocketMessage = (message: RawData) => {
      if (cleanedUp) {
        return;
      }

      const messageBytes = resolveRawMessageByteLength(message);
      if (messageBytes > maxMessageBytes) {
        metrics.increment("webSocketOversizedMessagesTotal");
        logger.warn("WebSocket inbound message exceeded size limit", {
          activityId,
          clientIp: upgradeRateLimitKey,
          maxBytes: maxMessageBytes,
          messageBytes,
        });
        cleanupSocket({
          clearSession: socketEntry !== null,
          reason: "message-too-big",
        });
        closeSocketIfNeeded(RUNTIME_WS_CLOSE_MESSAGE_TOO_BIG, "message too big");
        return;
      }

      if (messageBytes >= largeMessageWarnBytes) {
        logger.warn("Large WebSocket inbound frame observed", {
          activityId,
          messageBytes,
          thresholdBytes: largeMessageWarnBytes,
        });
      }

      if (!consumePayloadWindow(messageBytes)) {
        metrics.increment("webSocketPayloadWindowExceededTotal");
        logger.warn("WebSocket inbound payload window exceeded size limit", {
          activityId,
          clientIp: upgradeRateLimitKey,
          maxBytes: maxPayloadWindowBytes,
          messageBytes,
          windowMs: payloadWindowMs,
        });
        cleanupSocket({
          clearSession: socketEntry !== null,
          reason: "payload-window-exceeded",
        });
        closeSocketIfNeeded(RUNTIME_WS_CLOSE_MESSAGE_TOO_BIG, "payload window exceeded");
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
    lifecycleRegistry.trackSocket(ws, cleanupSocket);

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
    getLifecycleSnapshot: () => lifecycleRegistry.getSnapshot(),
  };
}
