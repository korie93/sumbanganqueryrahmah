import type { WebSocket, WebSocketServer } from "ws";
import type { PostgresStorage } from "../storage-postgres";
import type { RuntimeWsUpgradeRateLimiter } from "./upgrade-rate-limit";
import type { RuntimeWsMessageRateLimiter } from "./message-rate-limit";

export const MAX_RUNTIME_WS_CONNECTIONS_PER_USER = 5;
export const RUNTIME_WS_CLOSE_POLICY_VIOLATION = 1008;
export const RUNTIME_WS_CLOSE_TRY_AGAIN_LATER = 1013;

export type RuntimeManagerOptions = {
  wss: WebSocketServer;
  storage: Pick<PostgresStorage, "getActivityById"> & {
    clearCollectionNicknameSessionByActivity?: (activityId: string) => Promise<unknown> | unknown;
  };
  secret: string | readonly string[];
  connectedClients?: Map<string, WebSocket>;
  trustForwardedHeaders?: boolean;
  acceptConnections?: () => boolean;
  heartbeatIntervalMs?: number;
  messageRateLimiterFactory?: () => RuntimeWsMessageRateLimiter;
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
