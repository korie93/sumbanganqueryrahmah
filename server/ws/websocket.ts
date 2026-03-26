import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { PostgresStorage } from "../storage-postgres";
import { getSessionJwtVerificationSecrets } from "../auth/session-jwt";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { extractWsActivityId, isActiveWebSocketSession } from "./session-auth";

type LegacyWebSocketOptions = {
  storage?: Pick<PostgresStorage, "getActivityById">;
  secret?: string | readonly string[];
};

const defaultStorage = new PostgresStorage();
const defaultSessionSecrets = getSessionJwtVerificationSecrets();

export const connectedClients = new Map<string, WebSocket>();

export function setupWebSocket(server: Server, options: LegacyWebSocketOptions = {}) {
  const storage = options.storage ?? defaultStorage;
  const sessionSecret = options.secret ?? defaultSessionSecrets;
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get("token") || readAuthSessionTokenFromHeaders(req.headers);
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
