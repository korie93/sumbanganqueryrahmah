import { WebSocket, type WebSocketServer } from "ws";
import {
  RUNTIME_WS_CLOSE_REASON_SESSION_INVALID,
  RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
} from "../../shared/websocket-close-reasons";
import { logger } from "../lib/logger";
import { createBroadcastWsMessage } from "./ws-broadcast";
import { createRuntimeConnectionHandler } from "./ws-connection-lifecycle";
import { startRuntimeWebSocketHeartbeat } from "./ws-heartbeat";
import {
  CONNECTED_CLIENT_MONITOR_THRESHOLDS,
  DEFAULT_MAX_CONNECTIONS_PER_INSTANCE,
  DEFAULT_MAX_RUNTIME_WS_BUFFERED_BYTES,
  RUNTIME_WS_PENDING_AUTH_TTL_MS,
  RUNTIME_WS_TRACKED_SOCKET_SWEEP_INTERVAL_MS,
  type RuntimeManagerOptions,
  type RuntimeTrackedSocketEntry,
  type RuntimeTrackedSocketState,
} from "./ws-runtime-types";
import {
  buildTrustedProxyMatcher,
  sanitizeRuntimeWebSocketError,
} from "./ws-runtime-utils";

export function createRuntimeWebSocketManager(options: RuntimeManagerOptions): {
  connectedClients: Map<string, WebSocket>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
} {
  const { wss, storage, secret } = options;
  const connectedClients = options.connectedClients ?? new Map<string, WebSocket>();
  const trustForwardedHeaders = options.trustForwardedHeaders === true;
  const trustedForwardedProxies = options.trustedForwardedProxies ?? [];
  const maxConnectionsPerInstance = Math.max(
    1,
    Math.floor(options.maxConnectionsPerInstance ?? DEFAULT_MAX_CONNECTIONS_PER_INSTANCE),
  );
  const maxBufferedBytes = Math.max(
    1,
    Math.floor(options.maxBufferedBytes ?? DEFAULT_MAX_RUNTIME_WS_BUFFERED_BYTES),
  );
  const trustedForwardedProxyMatcher = buildTrustedProxyMatcher(trustedForwardedProxies);
  const socketEntriesByActivity = new Map<string, RuntimeTrackedSocketEntry>();
  const socketEntriesByInstance = new WeakMap<WebSocket, RuntimeTrackedSocketEntry>();
  const trackedSockets = new Map<WebSocket, RuntimeTrackedSocketState>();
  const socketCleanupCallbacks = new WeakMap<WebSocket, () => void>();
  const loggedConnectedClientThresholds = new Set<number>();
  let peakConnectedClients = connectedClients.size;

  const isTrackableSocket = (ws: WebSocket) =>
    ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;

  for (const threshold of CONNECTED_CLIENT_MONITOR_THRESHOLDS) {
    if (connectedClients.size >= threshold) {
      loggedConnectedClientThresholds.add(threshold);
    }
  }

  const clearNicknameSession = (activityId: string) =>
    Promise.resolve(storage.clearCollectionNicknameSessionByActivity?.(activityId))
      .then(() => undefined)
      .catch((error) => {
        logger.warn("Failed to clear nickname session after WebSocket cleanup", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
      });

  const trackConnectedClientGrowth = () => {
    const connectedClientCount = connectedClients.size;
    peakConnectedClients = Math.max(peakConnectedClients, connectedClientCount);

    for (const threshold of CONNECTED_CLIENT_MONITOR_THRESHOLDS) {
      if (connectedClientCount < threshold || loggedConnectedClientThresholds.has(threshold)) {
        continue;
      }

      loggedConnectedClientThresholds.add(threshold);
      const log = threshold >= 500 ? logger.warn : logger.info;
      log("WebSocket connectedClients map reached a monitored size threshold", {
        connectedClients: connectedClientCount,
        threshold,
        peakConnectedClients,
      });
    }
  };

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
    trackConnectedClientGrowth();
    return entry;
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

  const dropBackpressuredSocket = (activityId: string, ws: WebSocket) => {
    logger.warn("WebSocket client dropped because the send buffer exceeded the runtime limit", {
      activityId,
      bufferedAmount: ws.bufferedAmount,
      maxBufferedBytes,
    });
    removeTrackedSocket(activityId, ws);
    if (ws.readyState === WebSocket.OPEN) {
      ws.terminate();
    }
    void clearNicknameSession(activityId);
  };

  const countTrackedUserConnections = (userKey: string, excludedActivityId?: string) => {
    let count = 0;
    for (const entry of socketEntriesByActivity.values()) {
      if (entry.activityId === excludedActivityId || entry.userKey !== userKey) {
        continue;
      }
      if (entry.ws.readyState === WebSocket.OPEN || entry.ws.readyState === WebSocket.CONNECTING) {
        count += 1;
      }
    }
    return count;
  };

  const broadcastWsMessage = createBroadcastWsMessage({
    connectedClients,
    clearNicknameSession,
    dropBackpressuredSocket,
    maxBufferedBytes,
    removeTrackedSocket,
  });

  const heartbeatHandle = startRuntimeWebSocketHeartbeat({
    socketEntriesByActivity,
    removeTrackedSocket,
  });
  const trackedSocketSweepHandle = setInterval(() => {
    const now = Date.now();

    for (const [ws, trackedSocketState] of Array.from(trackedSockets.entries())) {
      if (!isTrackableSocket(ws)) {
        socketCleanupCallbacks.get(ws)?.();
        trackedSockets.delete(ws);
        continue;
      }

      if (
        trackedSocketState.authenticatedAt !== null
        || now - trackedSocketState.trackedAt <= RUNTIME_WS_PENDING_AUTH_TTL_MS
      ) {
        continue;
      }

      logger.warn("WebSocket pending-auth socket exceeded the runtime tracking TTL", {
        trackedForMs: now - trackedSocketState.trackedAt,
        maxTrackedMs: RUNTIME_WS_PENDING_AUTH_TTL_MS,
      });
      socketCleanupCallbacks.get(ws)?.();

      if (!isTrackableSocket(ws)) {
        continue;
      }

      try {
        ws.close(RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE, RUNTIME_WS_CLOSE_REASON_SESSION_INVALID);
      } catch (error) {
        logger.debug("WebSocket close request failed during tracked socket sweep", {
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
    }
  }, RUNTIME_WS_TRACKED_SOCKET_SWEEP_INTERVAL_MS);
  trackedSocketSweepHandle.unref?.();

  wss.once("close", () => {
    clearInterval(heartbeatHandle);
    clearInterval(trackedSocketSweepHandle);
    if (peakConnectedClients > 0) {
      logger.info("WebSocket connectedClients map shutdown summary", {
        connectedClients: connectedClients.size,
        peakConnectedClients,
      });
    }
    for (const ws of Array.from(trackedSockets.keys())) {
      socketCleanupCallbacks.get(ws)?.();
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
  });

  const handleConnection = createRuntimeConnectionHandler({
    connectedClients,
    socketEntriesByActivity,
    socketEntriesByInstance,
    trackedSockets,
    socketCleanupCallbacks,
    storage,
    secret,
    trustForwardedHeaders,
    trustedForwardedProxies,
    trustedForwardedProxyMatcher,
    registerTrackedSocketEntry,
    removeTrackedSocket,
    countTrackedUserConnections,
    countTrackedSockets: () => trackedSockets.size,
    isTrackableSocket,
    maxConnectionsPerInstance,
  });

  wss.on("connection", handleConnection as Parameters<WebSocketServer["on"]>[1]);

  return {
    connectedClients,
    broadcastWsMessage,
  };
}
