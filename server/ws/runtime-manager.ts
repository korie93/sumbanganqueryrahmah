import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { WebSocket, type WebSocketServer } from "ws";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { logger } from "../lib/logger";
import type { PostgresStorage } from "../storage-postgres";
import { extractWsActivityId, isActiveWebSocketSession } from "./session-auth";

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONNECTIONS_PER_USER = 5;
const MAX_RUNTIME_WS_MESSAGE_BYTES = 64 * 1024;
const MAX_RUNTIME_WS_BUFFERED_BYTES = 256 * 1024;

type RuntimeManagerOptions = {
  wss: WebSocketServer;
  storage: Pick<PostgresStorage, "getActivityById"> & {
    clearCollectionNicknameSessionByActivity?: (activityId: string) => Promise<unknown> | unknown;
  };
  secret: string | readonly string[];
  connectedClients?: Map<string, WebSocket>;
  trustForwardedHeaders?: boolean;
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

type RuntimeSocketCleanupOptions = {
  clearSession?: boolean;
  reason?: string;
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
  const socketEntriesByActivity = new Map<string, RuntimeTrackedSocketEntry>();
  const socketEntriesByInstance = new WeakMap<WebSocket, RuntimeTrackedSocketEntry>();
  const trackedSockets = new Set<WebSocket>();
  const socketCleanupCallbacks = new WeakMap<WebSocket, (options?: RuntimeSocketCleanupOptions) => void>();
  const isTrackableSocket = (ws: WebSocket) =>
    ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;
  const clearNicknameSession = (activityId: string, reason: string) =>
    Promise.resolve(storage.clearCollectionNicknameSessionByActivity?.(activityId)).catch((error) => {
      logger.error("Failed to clear nickname session after WebSocket cleanup", {
        activityId,
        operation: "clearCollectionNicknameSessionByActivity",
        reason,
        error: sanitizeRuntimeWebSocketError(error),
      });
    });
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
  const cleanupClient = (
    activityId: string,
    options: {
      expectedWs?: WebSocket;
      closeWith?: "close" | "terminate";
      clearSession?: boolean;
    } = {},
  ) => {
    const currentEntry = socketEntriesByActivity.get(activityId);
    const currentClient = connectedClients.get(activityId);
    const expectedWs = options.expectedWs;
    const targetWs = expectedWs ?? currentEntry?.ws ?? currentClient;

    if (!currentEntry && !currentClient && !expectedWs) {
      return false;
    }

    let cleanupCallbackHandled = false;
    if (targetWs) {
      const cleanupCallback = socketCleanupCallbacks.get(targetWs);
      if (cleanupCallback) {
        cleanupCallback({
          clearSession: options.clearSession === true,
          reason: options.closeWith ? `client-${options.closeWith}` : "client-cleanup",
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
      void clearNicknameSession(activityId, options.closeWith ? `client-${options.closeWith}` : "client-cleanup");
    }

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
  const dropBackpressuredSocket = (activityId: string, ws: WebSocket) => {
    logger.warn("WebSocket client dropped because the send buffer exceeded the runtime limit", {
      activityId,
      bufferedAmount: ws.bufferedAmount,
      maxBufferedBytes: MAX_RUNTIME_WS_BUFFERED_BYTES,
    });
    cleanupClient(activityId, {
      expectedWs: ws,
      closeWith: "terminate",
      clearSession: true,
    });
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
        cleanupClient(activityId, {
          expectedWs: ws,
          clearSession: true,
        });
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
        cleanupClient(activityId, {
          expectedWs: ws,
          clearSession: true,
        });
      }
    }
  };

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
        });
        continue;
      }

      if (!currentEntry.alive) {
        cleanupClient(activityId, {
          expectedWs: ws,
          closeWith: "terminate",
          clearSession: true,
        });
        continue;
      }

      currentEntry.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatHandle.unref();

  wss.once("close", () => {
    clearInterval(heartbeatHandle);
    for (const ws of Array.from(trackedSockets)) {
      socketCleanupCallbacks.get(ws)?.({
        clearSession: true,
        reason: "server-close",
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
  });

  wss.on("connection", async (ws, req) => {
    let activityId: string | null = null;
    let socketEntry: RuntimeTrackedSocketEntry | null = null;
    let cleanedUp = false;
    let closeRequested = false;
    let nicknameSessionClearQueued = false;

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
      ws.removeListener("close", handleSocketClose);
      ws.removeListener("error", handleSocketError);
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
    ws.once("close", handleSocketClose);
    ws.once("error", handleSocketError);
    trackedSockets.add(ws);
    socketCleanupCallbacks.set(ws, cleanupSocket);

    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (url.searchParams.has("token")) {
      logger.warn("WebSocket rejected query-string session token", {
        origin: req.headers.origin || null,
      });
      cleanupSocket();
      closeSocketIfNeeded();
      return;
    }

    if (!isSameOriginWebSocketRequest(req, { trustForwardedHeaders })) {
      logger.warn("WebSocket rejected cross-origin handshake", {
        origin: req.headers.origin || null,
        host: req.headers.host || null,
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
      if (userKey && countTrackedUserConnections(userKey, activityId) >= MAX_CONNECTIONS_PER_USER) {
        logger.warn("WebSocket rejected because the user connection limit was reached", {
          activityId,
          userKey,
          maxConnectionsPerUser: MAX_CONNECTIONS_PER_USER,
        });
        cleanupSocket();
        closeSocketIfNeeded();
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
