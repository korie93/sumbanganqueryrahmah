import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import {
  sanitizeRuntimeWebSocketError,
  type RuntimeWsCleanupClient,
} from "./ws-lifecycle";
import {
  MAX_RUNTIME_WS_BUFFERED_BYTES,
  serializeRuntimeWsPayload,
} from "./ws-message-router";

type RuntimeWsBroadcasterOptions = {
  cleanupClient: RuntimeWsCleanupClient;
  connectedClients: Map<string, WebSocket>;
};

export function createRuntimeWsBroadcaster({
  cleanupClient,
  connectedClients,
}: RuntimeWsBroadcasterOptions): (payload: Record<string, unknown>) => void {
  const dropBackpressuredSocket = (activityId: string, ws: WebSocket) => {
    logger.warn("WebSocket client dropped because the send buffer exceeded the runtime limit", {
      activityId,
      bufferedAmount: ws.bufferedAmount,
      maxBufferedBytes: MAX_RUNTIME_WS_BUFFERED_BYTES,
    });
    cleanupClient(activityId, {
      expectedWs: ws,
      closeWith: "terminate",
      clearSession: true,
    });
  };

  return (payload: Record<string, unknown>) => {
    const message = serializeRuntimeWsPayload(payload);
    if (!message) {
      return;
    }
    const messageBytes = Buffer.byteLength(message, "utf8");

    for (const [activityId, ws] of connectedClients.entries()) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        cleanupClient(activityId, {
          expectedWs: ws,
          clearSession: true,
        });
        continue;
      }

      if (
        ws.bufferedAmount > MAX_RUNTIME_WS_BUFFERED_BYTES
        || ws.bufferedAmount + messageBytes > MAX_RUNTIME_WS_BUFFERED_BYTES
      ) {
        dropBackpressuredSocket(activityId, ws);
        continue;
      }

      try {
        ws.send(message);
        if (ws.bufferedAmount > MAX_RUNTIME_WS_BUFFERED_BYTES) {
          dropBackpressuredSocket(activityId, ws);
        }
      } catch (error) {
        logger.warn("WebSocket broadcast failed", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
        cleanupClient(activityId, {
          expectedWs: ws,
          clearSession: true,
        });
      }
    }
  };
}
