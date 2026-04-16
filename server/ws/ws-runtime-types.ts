import type { WebSocket, WebSocketServer } from "ws";
import type { PostgresStorage } from "../storage-postgres";

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MAX_CONNECTIONS_PER_USER = 5;
export const MAX_INBOUND_MESSAGES_PER_MINUTE = 100;
export const INBOUND_MESSAGE_RATE_WINDOW_MS = 60_000;
export const MAX_RUNTIME_WS_MESSAGE_BYTES = 64 * 1024;
export const MAX_RUNTIME_WS_BUFFERED_BYTES = 256 * 1024;
export const CONNECTED_CLIENT_MONITOR_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1_000] as const;

export type RuntimeManagerOptions = {
  wss: WebSocketServer;
  storage: Pick<PostgresStorage, "getActivityById"> & {
    clearCollectionNicknameSessionByActivity?: (activityId: string) => Promise<unknown> | unknown;
  };
  secret: string | readonly string[];
  connectedClients?: Map<string, WebSocket>;
  trustForwardedHeaders?: boolean;
  trustedForwardedProxies?: readonly string[];
};

export type RuntimeWebSocketActivity = {
  id?: string | null;
  userId?: string | number | null;
  username?: string | null;
};

export type RuntimeWebSocketErrorLike = {
  name?: unknown;
  code?: unknown;
  type?: unknown;
};

export type RuntimeTrackedSocketEntry = {
  activityId: string;
  ws: WebSocket;
  userKey: string | null;
  alive: boolean;
};

export type RuntimeInboundMessageRateState = {
  windowStartedAt: number;
  messageCount: number;
};

export type RuntimeForwardedHeaderTrustOptions = {
  trustForwardedHeaders: boolean;
  trustedForwardedProxies: readonly string[];
};

export type RuntimeOriginValidationReason =
  | "missing_origin"
  | "invalid_origin"
  | "unsupported_origin_protocol"
  | "missing_request_host"
  | "host_mismatch"
  | "protocol_mismatch";

export type RuntimeOriginValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: RuntimeOriginValidationReason;
    };

export type RuntimeTrustedForwardedProxyMatcher = ((remoteAddress: string) => boolean) | null;
