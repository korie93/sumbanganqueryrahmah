import { WebSocket, type WebSocketServer } from "ws";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { logger } from "../lib/logger";
import type { PostgresStorage } from "../storage-postgres";
import { extractWsActivityId, isActiveWebSocketSession } from "./session-auth";

const HEARTBEAT_INTERVAL_MS = 30_000;

type RuntimeManagerOptions = {
  wss: WebSocketServer;
  storage: Pick<PostgresStorage, "getActivityById"> & {
    clearCollectionNicknameSessionByActivity?: (activityId: string) => Promise<unknown> | unknown;
  };
  secret: string | readonly string[];
  connectedClients?: Map<string, WebSocket>;
};

export function createRuntimeWebSocketManager(options: RuntimeManagerOptions): {
  connectedClients: Map<string, WebSocket>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
} {
  const { wss, storage, secret } = options;
  const connectedClients = options.connectedClients ?? new Map<string, WebSocket>();
  const aliveSockets = new WeakSet<WebSocket>();
  const isTrackableSocket = (ws: WebSocket) =>
    ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;
  const clearNicknameSession = (activityId: string) =>
    Promise.resolve(storage.clearCollectionNicknameSessionByActivity?.(activityId)).catch(() => undefined);

  const broadcastWsMessage = (payload: Record<string, unknown>) => {
    const message = JSON.stringify(payload);

    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectedClients.delete(activityId);
        void clearNicknameSession(activityId);
        continue;
      }

      try {
        ws.send(message);
      } catch {
        connectedClients.delete(activityId);
        void clearNicknameSession(activityId);
      }
    }
  };

  const heartbeatHandle = setInterval(() => {
    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
        connectedClients.delete(activityId);
        continue;
      }

      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (!aliveSockets.has(ws)) {
        connectedClients.delete(activityId);
        ws.terminate();
        continue;
      }

      aliveSockets.delete(ws);
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatHandle.unref();

  wss.once("close", () => {
    clearInterval(heartbeatHandle);
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
        connectedClients.delete(activityId);
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
    const token = url.searchParams.get("token") || readAuthSessionTokenFromHeaders(req.headers);

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

      const existingWs = connectedClients.get(activityId);
      if (existingWs && existingWs.readyState === WebSocket.OPEN) {
        existingWs.close();
      }

      if (cleanedUp || !isTrackableSocket(ws)) {
        cleanupSocket();
        return;
      }

      connectedClients.set(activityId, ws);
      markSocketAlive();
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
