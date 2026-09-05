import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import {
  sanitizeRuntimeWebSocketError,
  type RuntimeWsCleanupClient,
} from "./ws-lifecycle";
import {
  MAX_RUNTIME_WS_BUFFERED_BYTES,
  RUNTIME_WS_BACKPRESSURE_GRACE_MS,
  serializeRuntimeWsPayload,
} from "./ws-message-router";

type RuntimeWsBroadcasterOptions = {
  cleanupClient: RuntimeWsCleanupClient;
  connectedClients: Map<string, WebSocket>;
  now?: () => number;
};

export function createRuntimeWsBroadcaster({
  cleanupClient,
  connectedClients,
  now = Date.now,
}: RuntimeWsBroadcasterOptions): (payload: Record<string, unknown>) => void {
  const backpressureStartedAtBySocket = new WeakMap<WebSocket, number>();

  const dropBackpressuredSocket = (activityId: string, ws: WebSocket) => {
    logger.warn("WebSocket client dropped because the send buffer remained above the runtime limit after grace period", {
      activityId,
      bufferedAmount: ws.bufferedAmount,
      graceMs: RUNTIME_WS_BACKPRESSURE_GRACE_MS,
      maxBufferedBytes: MAX_RUNTIME_WS_BUFFERED_BYTES,
    });
    cleanupClient(activityId, {
      expectedWs: ws,
      closeWith: "terminate",
    });
  };

  const shouldDeferBackpressuredSend = (
    activityId: string,
    ws: WebSocket,
    messageBytes: number,
  ): boolean => {
    const projectedBufferedAmount = ws.bufferedAmount + messageBytes;
    if (
      ws.bufferedAmount <= MAX_RUNTIME_WS_BUFFERED_BYTES
      && projectedBufferedAmount <= MAX_RUNTIME_WS_BUFFERED_BYTES
    ) {
      backpressureStartedAtBySocket.delete(ws);
      return false;
    }

    const currentTime = now();
    const existingStartedAt = backpressureStartedAtBySocket.get(ws);
    const startedAt = existingStartedAt ?? currentTime;
    if (existingStartedAt === undefined) {
      backpressureStartedAtBySocket.set(ws, startedAt);
      logger.warn("WebSocket broadcast deferred because the send buffer is backpressured", {
        activityId,
        bufferedAmount: ws.bufferedAmount,
        graceMs: RUNTIME_WS_BACKPRESSURE_GRACE_MS,
        maxBufferedBytes: MAX_RUNTIME_WS_BUFFERED_BYTES,
        projectedBufferedAmount,
      });
    }

    if (currentTime - startedAt >= RUNTIME_WS_BACKPRESSURE_GRACE_MS) {
      dropBackpressuredSocket(activityId, ws);
    }

    return true;
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
        });
        continue;
      }

      if (shouldDeferBackpressuredSend(activityId, ws, messageBytes)) {
        continue;
      }

      try {
        ws.send(message);
        shouldDeferBackpressuredSend(activityId, ws, 0);
      } catch (error) {
        logger.warn("WebSocket broadcast failed", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
        cleanupClient(activityId, {
          expectedWs: ws,
        });
      }
    }
  };
}
