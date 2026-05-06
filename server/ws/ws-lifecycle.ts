import { WebSocket } from "ws";
import { resolveNodeEnv } from "../config/runtime-config-read-utils";

type RuntimeWebSocketErrorLike = {
  name?: unknown;
  code?: unknown;
  type?: unknown;
};

export type RuntimeWsCleanupClient = (
  activityId: string,
  options?: {
    expectedWs?: WebSocket;
    closeWith?: "close" | "terminate";
    clearSession?: boolean;
    reason?: string;
  },
) => boolean;

export function shouldLogRuntimeWebSocketCleanupDiagnostics(): boolean {
  const nodeEnv = resolveNodeEnv();
  return nodeEnv === "development" || nodeEnv === "test";
}

export function isTrackableSocket(ws: WebSocket) {
  return ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;
}

export function sanitizeRuntimeWebSocketError(error: unknown): Record<string, unknown> | undefined {
  if (typeof error === "string") {
    return {
      type: "string",
    };
  }

  if (!error || typeof error !== "object") {
    return undefined;
  }

  const errorLike = error as RuntimeWebSocketErrorLike;
  const name = typeof errorLike.name === "string" ? errorLike.name.trim() : "";
  const code = typeof errorLike.code === "string" ? errorLike.code.trim() : "";
  const type = typeof errorLike.type === "string" ? errorLike.type.trim() : "";

  return {
    ...(name ? { name } : {}),
    ...(code ? { code } : {}),
    ...(type ? { type } : {}),
  };
}
