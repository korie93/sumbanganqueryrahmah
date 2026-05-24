import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { runtimeConfig } from "../config/runtime";
import { getSessionJwtVerificationSecrets } from "../auth/session-jwt";
import type { PostgresStorage } from "../storage-postgres";
import { createRuntimeWebSocketManager } from "./runtime-manager";

type LegacyWebSocketOptions = {
  storage?: Pick<PostgresStorage, "getActivityById" | "clearCollectionNicknameSessionByActivity">;
  secret?: string | readonly string[];
};

const WEBSOCKET_MAX_PAYLOAD_BYTES = 100 * 1024;

function getDefaultSessionSecrets() {
  return getSessionJwtVerificationSecrets();
}

// Legacy setupWebSocket is process-local by design. Production startup currently
// constrains workers until shared limiter/broadcast infrastructure exists, so
// this Map must not be treated as distributed cluster state.
export const connectedClients = new Map<string, WebSocket>();

export function setupWebSocket(server: Server, options: LegacyWebSocketOptions = {}) {
  if (!options.storage) {
    throw new Error(
      "setupWebSocket requires an initialized storage instance. Call storage.init() at the composition root before attaching WebSocket handlers.",
    );
  }

  const storage = options.storage;
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
    maxConnections: runtimeConfig.websocket.maxConnections,
    trustForwardedHeaders: runtimeConfig.app.trustedProxies.length > 0,
  });

  return { wss, connectedClients };
}
