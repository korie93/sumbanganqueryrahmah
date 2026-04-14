import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";
import { WebSocket, type WebSocketServer } from "ws";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { logger } from "../lib/logger";
import type { PostgresStorage } from "../storage-postgres";
import { extractWsActivityId, isActiveWebSocketSession } from "./session-auth";

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONNECTIONS_PER_USER = 5;
const MAX_INBOUND_MESSAGES_PER_MINUTE = 100;
const INBOUND_MESSAGE_RATE_WINDOW_MS = 60_000;
const MAX_RUNTIME_WS_MESSAGE_BYTES = 64 * 1024;
const MAX_RUNTIME_WS_BUFFERED_BYTES = 256 * 1024;
const CONNECTED_CLIENT_MONITOR_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1_000] as const;

type RuntimeManagerOptions = {
  wss: WebSocketServer;
  storage: Pick<PostgresStorage, "getActivityById"> & {
    clearCollectionNicknameSessionByActivity?: (activityId: string) => Promise<unknown> | unknown;
  };
  secret: string | readonly string[];
  connectedClients?: Map<string, WebSocket>;
  trustForwardedHeaders?: boolean;
  trustedForwardedProxies?: readonly string[];
};

type RuntimeWebSocketActivity = {
  id?: string | null;
  userId?: string | number | null;
  username?: string | null;
};

type RuntimeWebSocketErrorLike = {
  name?: unknown;
  code?: unknown;
  type?: unknown;
};

type RuntimeTrackedSocketEntry = {
  activityId: string;
  ws: WebSocket;
  userKey: string | null;
  alive: boolean;
};

type RuntimeInboundMessageRateState = {
  windowStartedAt: number;
  messageCount: number;
};

type RuntimeForwardedHeaderTrustOptions = {
  trustForwardedHeaders: boolean;
  trustedForwardedProxies: readonly string[];
};

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return String(value[0] || "");
  }
  return String(value || "");
}

function firstForwardedValue(value: string | string[] | undefined): string {
  return firstHeaderValue(value).split(",")[0]?.trim() || "";
}

function normalizeSocketAddress(value: string | undefined): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const zoneLess = trimmed.split("%")[0] || "";
  const ipv4MappedMatch = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(zoneLess);
  return (ipv4MappedMatch?.[1] || zoneLess).toLowerCase();
}

function buildTrustedProxyMatcher(trustedProxies: readonly string[]) {
  if (trustedProxies.length === 0) {
    return null;
  }

  const blockList = new BlockList();
  const exactAddresses = new Set<string>();

  const addSubnet = (address: string, prefix: number) => {
    const normalizedAddress = normalizeSocketAddress(address);
    const family = isIP(normalizedAddress);
    if (!family) {
      return;
    }
    blockList.addSubnet(normalizedAddress, prefix, family === 4 ? "ipv4" : "ipv6");
  };

  const addAddress = (address: string) => {
    const normalizedAddress = normalizeSocketAddress(address);
    if (!isIP(normalizedAddress)) {
      return;
    }
    exactAddresses.add(normalizedAddress);
  };

  for (const entry of trustedProxies) {
    const normalizedEntry = String(entry || "").trim().toLowerCase();
    if (!normalizedEntry) {
      continue;
    }

    if (normalizedEntry === "loopback") {
      addSubnet("127.0.0.0", 8);
      addAddress("::1");
      continue;
    }

    if (normalizedEntry === "linklocal") {
      addSubnet("169.254.0.0", 16);
      addSubnet("fe80::", 10);
      continue;
    }

    if (normalizedEntry === "uniquelocal") {
      addSubnet("10.0.0.0", 8);
      addSubnet("172.16.0.0", 12);
      addSubnet("192.168.0.0", 16);
      addSubnet("fc00::", 7);
      continue;
    }

    const slashIndex = normalizedEntry.lastIndexOf("/");
    if (slashIndex > 0) {
      const candidateAddress = normalizeSocketAddress(normalizedEntry.slice(0, slashIndex));
      const prefix = Number.parseInt(normalizedEntry.slice(slashIndex + 1), 10);
      if (Number.isFinite(prefix) && isIP(candidateAddress)) {
        addSubnet(candidateAddress, prefix);
        continue;
      }
    }

    addAddress(normalizedEntry);
  }

  return (remoteAddress: string) => {
    const normalizedAddress = normalizeSocketAddress(remoteAddress);
    const family = isIP(normalizedAddress);
    if (!family) {
      return false;
    }

    return exactAddresses.has(normalizedAddress) || blockList.check(normalizedAddress, family === 4 ? "ipv4" : "ipv6");
  };
}

function shouldTrustForwardedHeaders(
  req: Pick<IncomingMessage, "socket">,
  options: RuntimeForwardedHeaderTrustOptions,
  matcher: ReturnType<typeof buildTrustedProxyMatcher>,
): boolean {
  if (!options.trustForwardedHeaders) {
    return false;
  }

  if (!matcher) {
    return true;
  }

  return matcher(normalizeSocketAddress(req.socket?.remoteAddress));
}

function readWebSocketRequestHost(
  headers: IncomingHttpHeaders,
  options: { trustForwardedHeaders: boolean },
): string {
  const trustedForwardedHost = options.trustForwardedHeaders
    ? firstForwardedValue(headers["x-forwarded-host"])
    : "";
  return (trustedForwardedHost || firstHeaderValue(headers.host))
    .trim()
    .toLowerCase();
}

function readWebSocketRequestProto(
  req: Pick<IncomingMessage, "headers" | "socket">,
  options: { trustForwardedHeaders: boolean },
): string {
  const forwardedProto = options.trustForwardedHeaders
    ? firstForwardedValue(req.headers["x-forwarded-proto"]).toLowerCase()
    : "";
  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }

  return req.socket && "encrypted" in req.socket && req.socket.encrypted ? "https" : "http";
}

function isSameOriginWebSocketRequest(
  req: Pick<IncomingMessage, "headers" | "socket">,
  options: { trustForwardedHeaders: boolean },
): boolean {
  const origin = firstHeaderValue(req.headers.origin).trim();
  if (!origin) {
    return true;
  }

  const requestHost = readWebSocketRequestHost(req.headers, options);
  if (!requestHost) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host.toLowerCase() !== requestHost) {
      return false;
    }

    const requestProto = readWebSocketRequestProto(req, options);
    return originUrl.protocol === `${requestProto}:`;
  } catch {
    return false;
  }
}

function getActivityUserKey(activity: RuntimeWebSocketActivity): string | null {
  const userId = String(activity.userId ?? "").trim();
  if (userId) {
    return `id:${userId}`;
  }

  const username = String(activity.username || "").trim().toLowerCase();
  return username ? `username:${username}` : null;
}

function sanitizeRuntimeWebSocketError(error: unknown): Record<string, unknown> | undefined {
  if (typeof error === "string") {
    return {
      type: "string",
    };
  }

  if (!error || typeof error !== "object") {
    return undefined;
  }

  const errorLike = error as RuntimeWebSocketErrorLike;
  const name = typeof errorLike.name === "string" ? errorLike.name.trim() : "";
  const code = typeof errorLike.code === "string" ? errorLike.code.trim() : "";
  const type = typeof errorLike.type === "string" ? errorLike.type.trim() : "";

  return {
    ...(name ? { name } : {}),
    ...(code ? { code } : {}),
    ...(type ? { type } : {}),
  };
}

function serializeRuntimeWsPayload(payload: Record<string, unknown>): string | null {
  try {
    const message = JSON.stringify(payload);
    if (Buffer.byteLength(message, "utf8") > MAX_RUNTIME_WS_MESSAGE_BYTES) {
      logger.warn("WebSocket broadcast skipped because the payload is too large", {
        maxBytes: MAX_RUNTIME_WS_MESSAGE_BYTES,
      });
      return null;
    }

    return message;
  } catch (error) {
    logger.warn("WebSocket broadcast skipped because the payload could not be serialized", {
      error: sanitizeRuntimeWebSocketError(error),
    });
    return null;
  }
}

export function createRuntimeWebSocketManager(options: RuntimeManagerOptions): {
  connectedClients: Map<string, WebSocket>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
} {
  const { wss, storage, secret } = options;
  const connectedClients = options.connectedClients ?? new Map<string, WebSocket>();
  const trustForwardedHeaders = options.trustForwardedHeaders === true;
  const trustedForwardedProxies = options.trustedForwardedProxies ?? [];
  const trustedForwardedProxyMatcher = buildTrustedProxyMatcher(trustedForwardedProxies);
  const socketEntriesByActivity = new Map<string, RuntimeTrackedSocketEntry>();
  const socketEntriesByInstance = new WeakMap<WebSocket, RuntimeTrackedSocketEntry>();
  const trackedSockets = new Set<WebSocket>();
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
    Promise.resolve(storage.clearCollectionNicknameSessionByActivity?.(activityId)).catch((error) => {
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
      maxBufferedBytes: MAX_RUNTIME_WS_BUFFERED_BYTES,
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

  const broadcastWsMessage = (payload: Record<string, unknown>) => {
    const message = serializeRuntimeWsPayload(payload);
    if (!message) {
      return;
    }
    const messageBytes = Buffer.byteLength(message, "utf8");

    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        removeTrackedSocket(activityId, ws);
        void clearNicknameSession(activityId);
        continue;
      }

      if (
        ws.bufferedAmount > MAX_RUNTIME_WS_BUFFERED_BYTES
        || ws.bufferedAmount + messageBytes > MAX_RUNTIME_WS_BUFFERED_BYTES
      ) {
        dropBackpressuredSocket(activityId, ws);
        continue;
      }

      try {
        ws.send(message);
        if (ws.bufferedAmount > MAX_RUNTIME_WS_BUFFERED_BYTES) {
          dropBackpressuredSocket(activityId, ws);
        }
      } catch (error) {
        logger.warn("WebSocket broadcast failed", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
        removeTrackedSocket(activityId, ws);
        void clearNicknameSession(activityId);
      }
    }
  };

  const heartbeatHandle = setInterval(() => {
    for (const entry of Array.from(socketEntriesByActivity.values())) {
      const { activityId, ws } = entry;
      if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
        removeTrackedSocket(activityId, ws);
        continue;
      }

      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      const currentEntry = socketEntriesByActivity.get(activityId);
      if (!currentEntry || currentEntry.ws !== ws) {
        removeTrackedSocket(activityId, ws);
        continue;
      }

      if (!currentEntry.alive) {
        removeTrackedSocket(activityId, ws);
        if (ws.readyState === WebSocket.OPEN) {
          ws.terminate();
        }
        continue;
      }

      currentEntry.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatHandle.unref();

  wss.once("close", () => {
    clearInterval(heartbeatHandle);
    if (peakConnectedClients > 0) {
      logger.info("WebSocket connectedClients map shutdown summary", {
        connectedClients: connectedClients.size,
        peakConnectedClients,
      });
    }
    for (const ws of Array.from(trackedSockets)) {
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

  wss.on("connection", async (ws, req) => {
    let activityId: string | null = null;
    let socketEntry: RuntimeTrackedSocketEntry | null = null;
    let cleanedUp = false;
    let closeRequested = false;
    const inboundMessageRateState: RuntimeInboundMessageRateState = {
      windowStartedAt: Date.now(),
      messageCount: 0,
    };

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
      ws.removeListener("pong", markSocketAlive);
      ws.removeListener("message", handleSocketMessage);
      ws.removeListener("close", handleSocketClose);
      ws.removeListener("error", handleSocketError);
    };

    const cleanupSocket = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      try {
        socketCleanupCallbacks.delete(ws);
        trackedSockets.delete(ws);
        socketEntriesByInstance.delete(ws);

        if (socketEntry) {
          removeTrackedSocket(socketEntry.activityId, ws);
          socketEntry = null;
        } else if (activityId && connectedClients.get(activityId) === ws) {
          removeTrackedSocket(activityId, ws);
        }
      } finally {
        detachSocketLifecycleHandlers();
      }
    };

    const cleanupSocketSafely = (phase: string) => {
      try {
        cleanupSocket();
      } catch (error) {
        logger.warn("WebSocket cleanup failed", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
          phase,
        });
      }
    };

    const handleSocketClose = () => {
      const closedActivityId = activityId;
      cleanupSocketSafely("close");
      if (closedActivityId) {
        logger.debug("WebSocket closed", { activityId: closedActivityId });
      }
    };

    const handleSocketError = (error: unknown) => {
      const erroredActivityId = activityId;
      cleanupSocketSafely("error");
      if (erroredActivityId) {
        logger.debug("WebSocket errored", {
          activityId: erroredActivityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
    };

    const handleSocketMessage = () => {
      if (cleanedUp) {
        return;
      }

      const now = Date.now();
      if (now - inboundMessageRateState.windowStartedAt >= INBOUND_MESSAGE_RATE_WINDOW_MS) {
        inboundMessageRateState.windowStartedAt = now;
        inboundMessageRateState.messageCount = 0;
      }

      inboundMessageRateState.messageCount += 1;
      if (inboundMessageRateState.messageCount <= MAX_INBOUND_MESSAGES_PER_MINUTE) {
        return;
      }

      logger.warn("WebSocket client dropped because the inbound message rate exceeded the runtime limit", {
        activityId,
        messageCount: inboundMessageRateState.messageCount,
        maxMessagesPerMinute: MAX_INBOUND_MESSAGES_PER_MINUTE,
        windowMs: INBOUND_MESSAGE_RATE_WINDOW_MS,
      });
      cleanupSocketSafely("message-rate-limit");
      closeSocketIfNeeded();
    };

    const closeSocketIfNeeded = () => {
      if (closeRequested || !isTrackableSocket(ws)) {
        return;
      }

      closeRequested = true;
      try {
        ws.close();
      } catch (error) {
        logger.debug("WebSocket close request failed during cleanup", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
    };

    ws.on("pong", markSocketAlive);
    ws.on("message", handleSocketMessage);
    ws.once("close", handleSocketClose);
    ws.once("error", handleSocketError);
    trackedSockets.add(ws);
    socketCleanupCallbacks.set(ws, () => {
      cleanupSocketSafely("registered-callback");
    });

    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (url.searchParams.has("token")) {
      logger.warn("WebSocket rejected query-string session token", {
        origin: req.headers.origin || null,
      });
      cleanupSocket();
      closeSocketIfNeeded();
      return;
    }

    if (
      !isSameOriginWebSocketRequest(req, {
        trustForwardedHeaders: shouldTrustForwardedHeaders(
          req,
          {
            trustForwardedHeaders,
            trustedForwardedProxies,
          },
          trustedForwardedProxyMatcher,
        ),
      })
    ) {
      logger.warn("WebSocket rejected cross-origin handshake", {
        origin: req.headers.origin || null,
        host: req.headers.host || null,
      });
      cleanupSocketSafely("cross-origin-reject");
      closeSocketIfNeeded();
      return;
    }

    const token = readAuthSessionTokenFromHeaders(req.headers);

    if (!token) {
      cleanupSocketSafely("missing-token");
      closeSocketIfNeeded();
      return;
    }

    try {
      activityId = extractWsActivityId(token, secret);
      if (!activityId) {
        cleanupSocketSafely("invalid-token");
        closeSocketIfNeeded();
        return;
      }

      const activity = await storage.getActivityById(activityId);
      if (cleanedUp || !isTrackableSocket(ws)) {
        cleanupSocketSafely("validation-race");
        return;
      }

      if (!isActiveWebSocketSession(activity)) {
        logger.debug("WebSocket rejected because the session is invalid or expired", {
          activityId,
        });
        cleanupSocketSafely("inactive-session");
        closeSocketIfNeeded();
        return;
      }

      const userKey = getActivityUserKey(activity);
      if (userKey && countTrackedUserConnections(userKey, activityId) >= MAX_CONNECTIONS_PER_USER) {
        logger.warn("WebSocket rejected because the user connection limit was reached", {
          activityId,
          userKey,
          maxConnectionsPerUser: MAX_CONNECTIONS_PER_USER,
        });
        cleanupSocketSafely("user-limit");
        closeSocketIfNeeded();
        return;
      }

      const existingEntry = socketEntriesByActivity.get(activityId);
      const existingWs = existingEntry?.ws ?? connectedClients.get(activityId);
      socketEntry = registerTrackedSocketEntry(activityId, ws, userKey);
      markSocketAlive();

      if (cleanedUp || !isTrackableSocket(ws)) {
        cleanupSocketSafely("post-register-race");
        return;
      }

      if (existingWs && existingWs !== ws) {
        socketCleanupCallbacks.get(existingWs)?.();
        if (isTrackableSocket(existingWs)) {
          try {
            existingWs.close();
          } catch (error) {
            logger.debug("WebSocket close request failed during connection replacement cleanup", {
              activityId,
              error: sanitizeRuntimeWebSocketError(error),
            });
          }
        }
      }

      logger.debug("WebSocket connected", { activityId });
    } catch (error) {
      cleanupSocketSafely("handshake-catch");
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
