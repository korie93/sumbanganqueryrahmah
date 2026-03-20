import { WebSocket, type WebSocketServer } from "ws";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { logger } from "../lib/logger";
import type { PostgresStorage } from "../storage-postgres";
import { extractWsActivityId, isActiveWebSocketSession } from "./session-auth";

type RuntimeManagerOptions = {
  wss: WebSocketServer;
  storage: Pick<PostgresStorage, "getActivityById" | "clearCollectionNicknameSessionByActivity">;
  secret: string;
};

export function createRuntimeWebSocketManager(options: RuntimeManagerOptions): {
  connectedClients: Map<string, WebSocket>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
} {
  const { wss, storage, secret } = options;
  const connectedClients = new Map<string, WebSocket>();

  const broadcastWsMessage = (payload: Record<string, unknown>) => {
    const message = JSON.stringify(payload);

    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectedClients.delete(activityId);
        void storage.clearCollectionNicknameSessionByActivity(activityId);
        continue;
      }

      try {
        ws.send(message);
      } catch {
        connectedClients.delete(activityId);
        void storage.clearCollectionNicknameSessionByActivity(activityId);
      }
    }
  };

  const staleSocketSweepHandle = setInterval(() => {
    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
        connectedClients.delete(activityId);
      }
    }
  }, 30_000);
  staleSocketSweepHandle.unref();
  wss.once("close", () => {
    clearInterval(staleSocketSweepHandle);
  });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get("token") || readAuthSessionTokenFromHeaders(req.headers);

    if (!token) {
      ws.close();
      return;
    }

    try {
      const activityId = extractWsActivityId(token, secret);
      if (!activityId) {
        ws.close();
        return;
      }

      const activity = await storage.getActivityById(activityId);
      if (!isActiveWebSocketSession(activity)) {
        logger.debug("WebSocket rejected because the session is invalid or expired", {
          activityId,
        });
        ws.close();
        return;
      }

      const existingWs = connectedClients.get(activityId);
      if (existingWs && existingWs.readyState === WebSocket.OPEN) {
        existingWs.close();
      }

      connectedClients.set(activityId, ws);
      logger.debug("WebSocket connected", { activityId });

      const cleanupSocket = () => {
        if (connectedClients.get(activityId) === ws) {
          connectedClients.delete(activityId);
        }
      };

      ws.on("close", () => {
        cleanupSocket();
        logger.debug("WebSocket closed", { activityId });
      });
      ws.on("error", cleanupSocket);
    } catch (error) {
      logger.warn("WebSocket handshake failed", { error });
      ws.close();
    }
  });

  return {
    connectedClients,
    broadcastWsMessage,
  };
}
