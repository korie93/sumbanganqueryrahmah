import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { PostgresStorage } from "../storage-postgres";
import { getSessionSecret } from "../config/security";
import { extractWsActivityId, isActiveWebSocketSession } from "./session-auth";

type LegacyWebSocketOptions = {
  storage?: Pick<PostgresStorage, "getActivityById">;
  secret?: string;
};

const defaultStorage = new PostgresStorage();
const defaultSessionSecret = getSessionSecret();

export const connectedClients = new Map<string, WebSocket>();

export function setupWebSocket(server: Server, options: LegacyWebSocketOptions = {}) {
  const storage = options.storage ?? defaultStorage;
  const sessionSecret = options.secret ?? defaultSessionSecret;
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const activityId = token ? extractWsActivityId(token, sessionSecret) : null;
    if (!activityId) return ws.close();

    const activity = await storage.getActivityById(activityId);
    if (!isActiveWebSocketSession(activity)) return ws.close();

    connectedClients.set(activityId, ws);

    ws.on("close", () => {
      connectedClients.delete(activityId);
    });

    ws.on("error", () => {
      connectedClients.delete(activityId);
    });
  });

  return { wss, connectedClients };
}
