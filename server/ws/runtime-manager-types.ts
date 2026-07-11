import type { WebSocket, WebSocketServer } from "ws";
import type { PostgresStorage } from "../storage-postgres";
import type { InternalMetricsRecorder } from "../internal/metrics";
import type { RuntimeWsUpgradeRateLimiter } from "./upgrade-rate-limit";
import type { RuntimeWsMessageRateLimiter } from "./message-rate-limit";
import type { RuntimeWsSharedBus } from "./runtime-shared-bus";

export const MAX_RUNTIME_WS_CONNECTIONS_PER_USER = 5;
export const DEFAULT_RUNTIME_WS_MAX_CONNECTIONS_PER_IP = 20;
export const DEFAULT_RUNTIME_WS_MAX_CONNECTIONS = 1_000;
export const DEFAULT_RUNTIME_WS_MAX_MESSAGE_BYTES = 64 * 1024;
export const DEFAULT_RUNTIME_WS_PAYLOAD_WINDOW_BYTES = 512 * 1024;
export const DEFAULT_RUNTIME_WS_PAYLOAD_WINDOW_MS = 10_000;
export const RUNTIME_WS_CLOSE_GOING_AWAY = 1001;
export const RUNTIME_WS_CLOSE_POLICY_VIOLATION = 1008;
export const RUNTIME_WS_CLOSE_MESSAGE_TOO_BIG = 1009;
export const RUNTIME_WS_CLOSE_TRY_AGAIN_LATER = 1013;
export const DEFAULT_RUNTIME_WS_LARGE_MESSAGE_WARN_BYTES = 64 * 1024;

export type RuntimeManagerOptions = {
  wss: WebSocketServer;
  storage: Pick<PostgresStorage, "getActivityById"> & {
    clearCollectionNicknameSessionByActivity?: (activityId: string) => Promise<unknown> | unknown;
  };
  secret: string | readonly string[];
  connectedClients?: Map<string, WebSocket>;
  trustForwardedHeaders?: boolean;
  acceptConnections?: () => boolean;
  isShuttingDown?: () => boolean;
  heartbeatIntervalMs?: number;
  largeMessageWarnBytes?: number;
  maxMessageBytes?: number;
  maxPayloadWindowBytes?: number;
  payloadWindowMs?: number;
  maxConnections?: number;
  maxConnectionsPerIp?: number;
  metrics?: Pick<InternalMetricsRecorder, "increment">;
  isSessionJwtRevoked?: (jwtId: string) => Promise<boolean>;
  messageRateLimiterFactory?: () => RuntimeWsMessageRateLimiter;
  now?: () => number;
  sharedBus?: RuntimeWsSharedBus;
  upgradeRateLimiter?: RuntimeWsUpgradeRateLimiter;
};

export type RuntimeTrackedSocketEntry = {
  activityId: string;
  ws: WebSocket;
  userKey: string | null;
  alive: boolean;
};

export type RuntimeSocketCleanupOptions = {
  clearSession?: boolean;
  reason?: string;
};
