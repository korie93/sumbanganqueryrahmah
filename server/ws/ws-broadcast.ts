import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import {
  sanitizeRuntimeWebSocketError,
  serializeRuntimeWsPayload,
} from "./ws-runtime-utils";

type CreateBroadcastWsMessageOptions = {
  connectedClients: Map<string, WebSocket>;
  clearNicknameSession: (activityId: string) => Promise<void>;
  dropBackpressuredSocket: (activityId: string, ws: WebSocket) => void;
  maxBufferedBytes: number;
  removeTrackedSocket: (activityId: string, ws?: WebSocket) => void;
};

export function createBroadcastWsMessage(
  options: CreateBroadcastWsMessageOptions,
) {
  const {
    connectedClients,
    clearNicknameSession,
    dropBackpressuredSocket,
    maxBufferedBytes,
    removeTrackedSocket,
  } = options;

  return (payload: Record<string, unknown>) => {
    const message = serializeRuntimeWsPayload(payload);
    if (!message) {
      return;
    }

    const messageBytes = Buffer.byteLength(message, "utf8");

    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        removeTrackedSocket(activityId, ws);
        void clearNicknameSession(activityId);
        continue;
      }

      if (
        ws.bufferedAmount > maxBufferedBytes
        || ws.bufferedAmount + messageBytes > maxBufferedBytes
      ) {
        dropBackpressuredSocket(activityId, ws);
        continue;
      }

      try {
        ws.send(message);
        if (ws.bufferedAmount > maxBufferedBytes) {
          dropBackpressuredSocket(activityId, ws);
        }
      } catch (error) {
        logger.warn("WebSocket broadcast failed", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
        removeTrackedSocket(activityId, ws);
        void clearNicknameSession(activityId);
      }
    }
  };
}
