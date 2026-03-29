import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { getSessionJwtVerificationSecrets } from "../auth/session-jwt";
import { PostgresStorage } from "../storage-postgres";
import { createRuntimeWebSocketManager } from "./runtime-manager";

type LegacyWebSocketOptions = {
  storage?: Pick<PostgresStorage, "getActivityById" | "clearCollectionNicknameSessionByActivity">;
  secret?: string | readonly string[];
};

const defaultStorage = new PostgresStorage();
const defaultSessionSecrets = getSessionJwtVerificationSecrets();

export const connectedClients = new Map<string, WebSocket>();

export function setupWebSocket(server: Server, options: LegacyWebSocketOptions = {}) {
  const storage = options.storage ?? defaultStorage;
  const sessionSecret = options.secret ?? defaultSessionSecrets;
  const wss = new WebSocketServer({ server, path: "/ws" });

  createRuntimeWebSocketManager({
    wss,
    storage,
    secret: sessionSecret,
    connectedClients,
  });

  return { wss, connectedClients };
}
