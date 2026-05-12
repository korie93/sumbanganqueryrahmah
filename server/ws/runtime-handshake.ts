import type { IncomingMessage } from "node:http";
import { logger } from "../lib/logger";
import { firstHeaderValue } from "./ws-auth";
import { sanitizeRuntimeWebSocketError } from "./ws-lifecycle";

export function parseRuntimeWebSocketHandshakeUrl(
  req: Pick<IncomingMessage, "headers" | "url">,
): URL | null {
  const rawHost = firstHeaderValue(req.headers.host).trim();
  const host = rawHost || "localhost";
  const requestUrl = String(req.url || "/");

  try {
    const url = new URL(requestUrl, `http://${host}`);
    if (!rawHost) {
      logger.warn("WebSocket handshake missing host header; using localhost fallback", {
        path: url.pathname,
      });
    }
    return url;
  } catch (error) {
    logger.warn("WebSocket rejected malformed handshake URL", {
      operation: "parseWebSocketHandshakeUrl",
      hostPresent: Boolean(rawHost),
      hostLength: rawHost.length,
      requestTargetLength: requestUrl.length,
      error: sanitizeRuntimeWebSocketError(error),
    });
    return null;
  }
}
