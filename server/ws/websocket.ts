import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { PostgresStorage } from "../storage-postgres";

const storage = new PostgresStorage();

export const connectedClients = new Map<string, WebSocket>();

export function setupWebSocket(server: any) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) return ws.close();

    const decoded = jwt.verify(token, process.env.SESSION_SECRET!) as any;
    const activity = await storage.getActivityById(decoded.activityId);
    if (!activity || !activity.isActive) return ws.close();

    connectedClients.set(activity.id, ws);

    ws.on("close", () => {
      connectedClients.delete(activity.id);
    });

    ws.on("error", () => {
      connectedClients.delete(activity.id);
    });
  });
}
