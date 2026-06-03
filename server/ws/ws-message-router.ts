import { logger } from "../lib/logger";
import { sanitizeRuntimeWebSocketError } from "./ws-lifecycle";

export const MAX_RUNTIME_WS_BUFFERED_BYTES = 256 * 1024;
export const MAX_RUNTIME_WS_MESSAGE_BYTES = 64 * 1024;
export const RUNTIME_WS_BACKPRESSURE_GRACE_MS = 5_000;

export function serializeRuntimeWsPayload(payload: Record<string, unknown>): string | null {
  try {
    const message = JSON.stringify(payload);
    if (Buffer.byteLength(message, "utf8") > MAX_RUNTIME_WS_MESSAGE_BYTES) {
      logger.warn("WebSocket broadcast skipped because the payload is too large", {
        maxBytes: MAX_RUNTIME_WS_MESSAGE_BYTES,
      });
      return null;
    }

    return message;
  } catch (error) {
    logger.warn("WebSocket broadcast skipped because the payload could not be serialized", {
      error: sanitizeRuntimeWebSocketError(error),
    });
    return null;
  }
}
