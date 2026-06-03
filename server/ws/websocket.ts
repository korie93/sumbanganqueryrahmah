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

function getDefaultSessionSecrets() {
  return getSessionJwtVerificationSecrets();
}

/**
 * ARCHITECTURE CONSTRAINT: This map is process-local.
 *
 * In multi-worker cluster mode, each worker owns a separate connectedClients
 * map. Direct iteration only reaches sockets attached to the same worker.
 *
 * Safe production modes:
 * - SQR_MAX_WORKERS=1 for single-process deployments.
 * - SQR_MAX_WORKERS>1 only with SQR_WS_SHARED_BUS=redis so runtime broadcasts
 *   and activity close events propagate across workers.
 *
 * Production-like startup fails fast when multi-worker WebSocket fan-out would
 * otherwise rely on this process-local map alone. See docs/architecture.md.
 */
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
    maxPayload: runtimeConfig.websocket.maxMessageBytes,
  });

  createRuntimeWebSocketManager({
    wss,
    storage,
    secret: sessionSecret,
    connectedClients,
    maxMessageBytes: runtimeConfig.websocket.maxMessageBytes,
    maxConnections: runtimeConfig.websocket.maxConnections,
    trustForwardedHeaders: runtimeConfig.app.trustedProxies.length > 0,
  });

  return { wss, connectedClients };
}
