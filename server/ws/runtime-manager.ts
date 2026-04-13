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
  const socketUserKeys = new Map<string, string>();
  const aliveSockets = new WeakSet<WebSocket>();
  const isTrackableSocket = (ws: WebSocket) =>
    ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;
  const clearNicknameSession = (activityId: string) =>
    Promise.resolve(storage.clearCollectionNicknameSessionByActivity?.(activityId)).catch((error) => {
      logger.warn("Failed to clear nickname session after WebSocket cleanup", {
        activityId,
        error: sanitizeRuntimeWebSocketError(error),
      });
    });
  const removeTrackedSocket = (activityId: string) => {
    connectedClients.delete(activityId);
    socketUserKeys.delete(activityId);
  };
  const dropBackpressuredSocket = (activityId: string, ws: WebSocket) => {
    logger.warn("WebSocket client dropped because the send buffer exceeded the runtime limit", {
      activityId,
      bufferedAmount: ws.bufferedAmount,
      maxBufferedBytes: MAX_RUNTIME_WS_BUFFERED_BYTES,
    });
    removeTrackedSocket(activityId);
    if (ws.readyState === WebSocket.OPEN) {
      ws.terminate();
    }
    void clearNicknameSession(activityId);
  };
  const countTrackedUserConnections = (userKey: string, excludedActivityId?: string) => {
    let count = 0;
    for (const [trackedActivityId, trackedUserKey] of socketUserKeys.entries()) {
      if (trackedActivityId === excludedActivityId || trackedUserKey !== userKey) {
        continue;
      }
      const trackedSocket = connectedClients.get(trackedActivityId);
      if (
        trackedSocket
        && (trackedSocket.readyState === WebSocket.OPEN || trackedSocket.readyState === WebSocket.CONNECTING)
      ) {
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
        removeTrackedSocket(activityId);
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
        removeTrackedSocket(activityId);
        void clearNicknameSession(activityId);
      }
    }
  };

  const heartbeatHandle = setInterval(() => {
    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
        removeTrackedSocket(activityId);
        continue;
      }

      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (!aliveSockets.has(ws)) {
        removeTrackedSocket(activityId);
        if (ws.readyState === WebSocket.OPEN) {
          ws.terminate();
        }
        continue;
      }

      aliveSockets.delete(ws);
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatHandle.unref();

  wss.once("close", () => {
    clearInterval(heartbeatHandle);
    connectedClients.clear();
    socketUserKeys.clear();
  });

  wss.on("connection", async (ws, req) => {
    let activityId: string | null = null;
    let cleanedUp = false;
    let closeRequested = false;

    const markSocketAlive = () => {
      if (!cleanedUp) {
        aliveSockets.add(ws);
      }
    };

    const detachSocketLifecycleHandlers = () => {
      ws.removeListener("pong", markSocketAlive);
      ws.removeListener("close", handleSocketClose);
      ws.removeListener("error", handleSocketError);
    };

    const cleanupSocket = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      aliveSockets.delete(ws);
      detachSocketLifecycleHandlers();

      if (activityId && connectedClients.get(activityId) === ws) {
        removeTrackedSocket(activityId);
      }
    };

    const handleSocketClose = () => {
      const closedActivityId = activityId;
      cleanupSocket();
      if (closedActivityId) {
        logger.debug("WebSocket closed", { activityId: closedActivityId });
      }
    };

    const handleSocketError = (error: unknown) => {
      const erroredActivityId = activityId;
      cleanupSocket();
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

      const existingWs = connectedClients.get(activityId);
      connectedClients.set(activityId, ws);
      if (userKey) {
        socketUserKeys.set(activityId, userKey);
      } else {
        socketUserKeys.delete(activityId);
      }
      markSocketAlive();

      if (cleanedUp || !isTrackableSocket(ws)) {
        cleanupSocket();
        return;
      }

      if (existingWs && existingWs !== ws && isTrackableSocket(existingWs)) {
        existingWs.close();
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
