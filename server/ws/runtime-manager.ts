import jwt from "jsonwebtoken";
import { WebSocket, type WebSocketServer } from "ws";
import type { PostgresStorage } from "../storage-postgres";

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

  setInterval(() => {
    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
        connectedClients.delete(activityId);
      }
    }
  }, 30_000).unref();

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close();
      return;
    }

    try {
      const decoded = jwt.verify(token, secret) as { activityId?: string };
      const activityId = String(decoded.activityId || "");
      if (!activityId) {
        ws.close();
        return;
      }

      const activity = await storage.getActivityById(activityId);
      if (!activity || activity.isActive === false || activity.logoutTime !== null) {
        console.log("WS rejected: invalid or expired session");
        ws.close();
        return;
      }

      const existingWs = connectedClients.get(activityId);
      if (existingWs && existingWs.readyState === WebSocket.OPEN) {
        existingWs.close();
      }

      connectedClients.set(activityId, ws);
      console.log(`WS connected for activityId=${activityId}`);

      const cleanupSocket = () => {
        if (connectedClients.get(activityId) === ws) {
          connectedClients.delete(activityId);
        }
      };

      ws.on("close", () => {
        cleanupSocket();
        console.log(`WS closed for activityId=${activityId}`);
      });
      ws.on("error", cleanupSocket);
    } catch {
      console.log("WS handshake failed");
      ws.close();
    }
  });

  return {
    connectedClients,
    broadcastWsMessage,
  };
}
