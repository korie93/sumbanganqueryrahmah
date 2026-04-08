import type { IncomingHttpHeaders } from "node:http";
import { WebSocket, type WebSocketServer } from "ws";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { logger } from "../lib/logger";
import type { PostgresStorage } from "../storage-postgres";
import { extractWsActivityId, isActiveWebSocketSession } from "./session-auth";

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONNECTIONS_PER_USER = 5;

type RuntimeManagerOptions = {
  wss: WebSocketServer;
  storage: Pick<PostgresStorage, "getActivityById"> & {
    clearCollectionNicknameSessionByActivity?: (activityId: string) => Promise<unknown> | unknown;
  };
  secret: string | readonly string[];
  connectedClients?: Map<string, WebSocket>;
};

type RuntimeWebSocketActivity = {
  id?: string | null;
  userId?: string | number | null;
  username?: string | null;
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

function readWebSocketRequestHost(headers: IncomingHttpHeaders): string {
  return (firstForwardedValue(headers["x-forwarded-host"]) || firstHeaderValue(headers.host))
    .trim()
    .toLowerCase();
}

function readWebSocketRequestProto(headers: IncomingHttpHeaders): string {
  return firstForwardedValue(headers["x-forwarded-proto"]).toLowerCase();
}

function isSameOriginWebSocketRequest(headers: IncomingHttpHeaders): boolean {
  const origin = firstHeaderValue(headers.origin).trim();
  if (!origin) {
    return true;
  }

  const requestHost = readWebSocketRequestHost(headers);
  if (!requestHost) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host.toLowerCase() !== requestHost) {
      return false;
    }

    const requestProto = readWebSocketRequestProto(headers);
    return !requestProto || originUrl.protocol === `${requestProto}:`;
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

export function createRuntimeWebSocketManager(options: RuntimeManagerOptions): {
  connectedClients: Map<string, WebSocket>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
} {
  const { wss, storage, secret } = options;
  const connectedClients = options.connectedClients ?? new Map<string, WebSocket>();
  const socketUserKeys = new Map<string, string>();
  const aliveSockets = new WeakSet<WebSocket>();
  const isTrackableSocket = (ws: WebSocket) =>
    ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;
  const clearNicknameSession = (activityId: string) =>
    Promise.resolve(storage.clearCollectionNicknameSessionByActivity?.(activityId)).catch((error) => {
      logger.warn("Failed to clear nickname session after WebSocket cleanup", {
        activityId,
        error,
      });
    });
  const removeTrackedSocket = (activityId: string) => {
    connectedClients.delete(activityId);
    socketUserKeys.delete(activityId);
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
    const message = JSON.stringify(payload);

    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        removeTrackedSocket(activityId);
        void clearNicknameSession(activityId);
        continue;
      }

      try {
        ws.send(message);
      } catch (error) {
        logger.warn("WebSocket broadcast failed", { activityId, error });
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
    socketUserKeys.clear();
  });

  wss.on("connection", async (ws, req) => {
    let activityId: string | null = null;
    let cleanedUp = false;

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
          error,
        });
      }
    };

    const closeSocketIfNeeded = () => {
      if (isTrackableSocket(ws)) {
        ws.close();
      }
    };

    ws.on("pong", markSocketAlive);
    ws.on("close", handleSocketClose);
    ws.on("error", handleSocketError);

    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (url.searchParams.has("token")) {
      logger.warn("WebSocket rejected query-string session token", {
        origin: req.headers.origin || null,
      });
      cleanupSocket();
      closeSocketIfNeeded();
      return;
    }

    if (!isSameOriginWebSocketRequest(req.headers)) {
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
      logger.warn("WebSocket handshake failed", { error });
      closeSocketIfNeeded();
    }
  });

  return {
    connectedClients,
    broadcastWsMessage,
  };
}
