import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { runtimeConfig } from "../config/runtime";
import { getSessionJwtVerificationSecrets } from "../auth/session-jwt";
import { PostgresStorage } from "../storage-postgres";
import { createRuntimeWebSocketManager } from "./runtime-manager";

type LegacyWebSocketOptions = {
  storage?: Pick<PostgresStorage, "getActivityById" | "clearCollectionNicknameSessionByActivity">;
  secret?: string | readonly string[];
};

const WEBSOCKET_MAX_PAYLOAD_BYTES = 100 * 1024;
let defaultStorage: PostgresStorage | null = null;
let defaultSessionSecrets: string | readonly string[] | null = null;

function getDefaultStorage() {
  if (!defaultStorage) {
    defaultStorage = new PostgresStorage();
  }

  return defaultStorage;
}

function getDefaultSessionSecrets() {
  if (!defaultSessionSecrets) {
    defaultSessionSecrets = getSessionJwtVerificationSecrets();
  }

  return defaultSessionSecrets;
}

export const connectedClients = new Map<string, WebSocket>();

export function setupWebSocket(server: Server, options: LegacyWebSocketOptions = {}) {
  const storage = options.storage ?? getDefaultStorage();
  const sessionSecret = options.secret ?? getDefaultSessionSecrets();
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: WEBSOCKET_MAX_PAYLOAD_BYTES,
  });

  createRuntimeWebSocketManager({
    wss,
    storage,
    secret: sessionSecret,
    connectedClients,
    trustForwardedHeaders: runtimeConfig.app.trustedProxies.length > 0,
  });

  return { wss, connectedClients };
}
