import type { IncomingMessage } from "node:http";
import { WebSocket, type RawData } from "ws";
import { z } from "zod";
import {
  RUNTIME_WS_CLOSE_REASON_SESSION_EXPIRED,
  RUNTIME_WS_CLOSE_REASON_SESSION_INVALID,
  RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
} from "../../shared/websocket-close-reasons";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { isSessionRevoked, revokeSession } from "../auth/session-revocation-registry";
import { logger } from "../lib/logger";
import { isActiveWebSocketSession, validateWsSessionToken } from "./session-auth";
import {
  INBOUND_MESSAGE_TOKEN_BUCKET_CAPACITY,
  INBOUND_MESSAGE_TOKEN_BUCKET_WINDOW_MS,
  MAX_CONNECTIONS_PER_USER,
  MAX_INBOUND_MESSAGES_PER_MINUTE,
  MAX_RUNTIME_WS_MESSAGE_BYTES,
  type RuntimeInboundMessageRateState,
  type RuntimeTrackedSocketEntry,
  type RuntimeTrackedSocketState,
  type RuntimeTrustedForwardedProxyMatcher,
  type RuntimeWebSocketActivity,
} from "./ws-runtime-types";
import {
  buildWebSocketHandshakeLogDetails,
  getActivityUserKey,
  sanitizeRuntimeWebSocketError,
  shouldTrustForwardedHeaders,
  validateSameOriginWebSocketRequest,
} from "./ws-runtime-utils";

const runtimeInboundPingMessageSchema = z.union([
  z.literal("ping"),
  z.object({
    type: z.literal("ping"),
  }).strict(),
]);

function decodeRuntimeInboundMessagePayload(payload: RawData, isBinary: boolean) {
  if (isBinary) {
    return {
      ok: false as const,
      reason: "binary-not-supported",
    };
  }

  const rawPayload = typeof payload === "string"
    ? payload
    : Buffer.isBuffer(payload)
      ? payload.toString("utf8")
      : Array.isArray(payload)
        ? Buffer.concat(payload).toString("utf8")
        : Buffer.from(payload).toString("utf8");
  const normalizedPayload = rawPayload.trim();

  if (!normalizedPayload) {
    return {
      ok: false as const,
      reason: "empty-message",
    };
  }

  if (Buffer.byteLength(normalizedPayload, "utf8") > MAX_RUNTIME_WS_MESSAGE_BYTES) {
    return {
      ok: false as const,
      reason: "message-too-large",
    };
  }

  if (normalizedPayload === "ping") {
    return {
      ok: true as const,
      message: "ping" as const,
    };
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(normalizedPayload);
  } catch (error) {
    void error;
    return {
      ok: false as const,
      reason: "invalid-json",
    };
  }

  const parsedMessage = runtimeInboundPingMessageSchema.safeParse(parsedPayload);
  if (!parsedMessage.success) {
    return {
      ok: false as const,
      reason: "unsupported-message-shape",
    };
  }

  return {
    ok: true as const,
    message: parsedMessage.data,
  };
}

type CreateRuntimeConnectionHandlerOptions = {
  connectedClients: Map<string, WebSocket>;
  socketEntriesByActivity: Map<string, RuntimeTrackedSocketEntry>;
  socketEntriesByInstance: WeakMap<WebSocket, RuntimeTrackedSocketEntry>;
  trackedSockets: Map<WebSocket, RuntimeTrackedSocketState>;
  socketCleanupCallbacks: WeakMap<WebSocket, () => void>;
  storage: {
    getActivityById: (
      activityId: string,
    ) => Promise<(RuntimeWebSocketActivity & {
      isActive?: boolean | null;
      logoutTime?: string | Date | null;
    }) | null | undefined>;
  };
  secret: string | readonly string[];
  trustForwardedHeaders: boolean;
  trustedForwardedProxies: readonly string[];
  trustedForwardedProxyMatcher: RuntimeTrustedForwardedProxyMatcher;
  registerTrackedSocketEntry: (
    activityId: string,
    ws: WebSocket,
    userKey: string | null,
  ) => RuntimeTrackedSocketEntry;
  removeTrackedSocket: (activityId: string, ws?: WebSocket) => void;
  countTrackedUserConnections: (userKey: string, excludedActivityId?: string) => number;
  countTrackedSockets: () => number;
  isTrackableSocket: (ws: WebSocket) => boolean;
  maxConnectionsPerInstance: number;
};

export function createRuntimeConnectionHandler(
  options: CreateRuntimeConnectionHandlerOptions,
) {
  const {
    connectedClients,
    socketEntriesByActivity,
    socketEntriesByInstance,
    trackedSockets,
    socketCleanupCallbacks,
    storage,
    secret,
    trustForwardedHeaders,
    trustedForwardedProxies,
    trustedForwardedProxyMatcher,
    registerTrackedSocketEntry,
    removeTrackedSocket,
    countTrackedUserConnections,
    countTrackedSockets,
    isTrackableSocket,
    maxConnectionsPerInstance,
  } = options;
  const inboundMessageTokenRefillRatePerMs =
    MAX_INBOUND_MESSAGES_PER_MINUTE / INBOUND_MESSAGE_TOKEN_BUCKET_WINDOW_MS;

  return async (ws: WebSocket, req: Pick<IncomingMessage, "url" | "headers" | "socket">) => {
    let activityId: string | null = null;
    let socketEntry: RuntimeTrackedSocketEntry | null = null;
    let cleanedUp = false;
    let closeRequested = false;
    const inboundMessageRateState: RuntimeInboundMessageRateState = {
      availableTokens: INBOUND_MESSAGE_TOKEN_BUCKET_CAPACITY,
      lastRefillAt: Date.now(),
    };

    const touchTrackedSocket = (markAuthenticated = false) => {
      const trackedSocketState = trackedSockets.get(ws);
      if (!trackedSocketState) {
        return;
      }

      const now = Date.now();
      trackedSocketState.lastSeenAt = now;
      if (markAuthenticated && trackedSocketState.authenticatedAt === null) {
        trackedSocketState.authenticatedAt = now;
      }
    };

    const markSocketAlive = () => {
      if (cleanedUp) {
        return;
      }

      touchTrackedSocket();
      const currentEntry = socketEntriesByInstance.get(ws) ?? socketEntry;
      if (currentEntry?.ws === ws) {
        currentEntry.alive = true;
      }
    };

    const detachSocketLifecycleHandlers = () => {
      ws.removeListener("pong", markSocketAlive);
      ws.removeListener("message", handleSocketMessage);
      ws.removeListener("close", handleSocketClose);
      ws.removeListener("error", handleSocketError);
    };

    const cleanupSocket = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      try {
        socketCleanupCallbacks.delete(ws);
        trackedSockets.delete(ws);
        socketEntriesByInstance.delete(ws);

        if (socketEntry) {
          removeTrackedSocket(socketEntry.activityId, ws);
          socketEntry = null;
        } else if (activityId && connectedClients.get(activityId) === ws) {
          removeTrackedSocket(activityId, ws);
        }
      } finally {
        detachSocketLifecycleHandlers();
      }
    };

    const captureCleanupStateSnapshot = () => ({
      hadCleanupCallback: socketCleanupCallbacks.has(ws),
      hadSocketEntry: Boolean(socketEntriesByInstance.get(ws) ?? socketEntry),
      hadTrackedSocketState: trackedSockets.has(ws),
      closeRequested,
      wsReadyState: ws.readyState,
    });

    const cleanupSocketSafely = (phase: string) => {
      const cleanupState = captureCleanupStateSnapshot();
      try {
        cleanupSocket();
      } catch (error) {
        logger.warn("WebSocket cleanup failed", {
          activityId,
          phase,
          ...cleanupState,
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
    };

    const handleSocketClose = () => {
      const closedActivityId = activityId;
      cleanupSocketSafely("close");
      if (closedActivityId) {
        logger.debug("WebSocket closed", { activityId: closedActivityId });
      }
    };

    const handleSocketError = (error: unknown) => {
      const erroredActivityId = activityId;
      cleanupSocketSafely("error");
      if (erroredActivityId) {
        logger.debug("WebSocket errored", {
          activityId: erroredActivityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
    };

    const closeSocketIfNeeded = (code?: number, reason?: string) => {
      if (
        closeRequested
        || !isTrackableSocket(ws)
        || ws.readyState === WebSocket.CLOSED
        || ws.readyState === WebSocket.CLOSING
      ) {
        return;
      }

      closeRequested = true;
      try {
        if (typeof code === "number") {
          ws.close(code, reason);
          return;
        }

        ws.close();
      } catch (error) {
        logger.debug("WebSocket close request failed during cleanup", {
          activityId,
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
    };

    const handleSocketMessage = (payload: RawData, isBinary: boolean) => {
      if (cleanedUp) {
        return;
      }

      touchTrackedSocket();
      const now = Date.now();
      const elapsedMs = Math.max(0, now - inboundMessageRateState.lastRefillAt);
      if (elapsedMs > 0) {
        inboundMessageRateState.availableTokens = Math.min(
          INBOUND_MESSAGE_TOKEN_BUCKET_CAPACITY,
          inboundMessageRateState.availableTokens + (elapsedMs * inboundMessageTokenRefillRatePerMs),
        );
        inboundMessageRateState.lastRefillAt = now;
      }

      if (inboundMessageRateState.availableTokens >= 1) {
        inboundMessageRateState.availableTokens -= 1;
      } else {
        logger.warn("WebSocket client dropped because the inbound message rate exceeded the runtime limit", {
          activityId,
          availableTokens: Math.max(0, Number(inboundMessageRateState.availableTokens.toFixed(3))),
          maxMessagesPerMinute: MAX_INBOUND_MESSAGES_PER_MINUTE,
          tokenBucketCapacity: INBOUND_MESSAGE_TOKEN_BUCKET_CAPACITY,
          refillWindowMs: INBOUND_MESSAGE_TOKEN_BUCKET_WINDOW_MS,
        });
        cleanupSocketSafely("message-rate-limit");
        closeSocketIfNeeded();
        return;
      }

      const decodedMessage = decodeRuntimeInboundMessagePayload(payload, isBinary);
      if (decodedMessage.ok) {
        return;
      }

      logger.warn("WebSocket client dropped because the inbound message payload was invalid", {
        activityId,
        reason: decodedMessage.reason,
        maxMessageBytes: MAX_RUNTIME_WS_MESSAGE_BYTES,
      });
      cleanupSocketSafely("message-parse");
      closeSocketIfNeeded(RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE);
    };

    const url = new URL(req.url!, `http://${req.headers.host}`);
    const forwardedHeadersTrusted = shouldTrustForwardedHeaders(
      req,
      {
        trustForwardedHeaders,
        trustedForwardedProxies,
      },
      trustedForwardedProxyMatcher,
    );

    if (countTrackedSockets() >= maxConnectionsPerInstance) {
      logger.warn(
        "WebSocket rejected because the instance connection limit was reached",
        {
          connectedSockets: countTrackedSockets(),
          maxConnectionsPerInstance,
        },
      );
      closeSocketIfNeeded();
      return;
    }

    if (url.searchParams.has("token")) {
      logger.warn(
        "WebSocket rejected query-string session token",
        buildWebSocketHandshakeLogDetails({
          req,
          trustForwardedHeaders,
          trustedForwardedProxyMatcher,
          rejectionReason: "query_token",
        }),
      );
      cleanupSocket();
      closeSocketIfNeeded();
      return;
    }

    const originValidation = validateSameOriginWebSocketRequest(req, {
      trustForwardedHeaders: forwardedHeadersTrusted,
    });

    if (!originValidation.ok) {
      logger.warn(
        "WebSocket rejected invalid same-origin handshake",
        buildWebSocketHandshakeLogDetails({
          req,
          trustForwardedHeaders,
          trustedForwardedProxyMatcher,
          rejectionReason: originValidation.reason,
        }),
      );
      cleanupSocketSafely("cross-origin-reject");
      closeSocketIfNeeded();
      return;
    }

    ws.on("pong", markSocketAlive);
    ws.on("message", handleSocketMessage);
    ws.once("close", handleSocketClose);
    ws.once("error", handleSocketError);
    const trackedAt = Date.now();
    trackedSockets.set(ws, {
      trackedAt,
      lastSeenAt: trackedAt,
      authenticatedAt: null,
    });
    socketCleanupCallbacks.set(ws, () => {
      cleanupSocketSafely("registered-callback");
    });

    const token = readAuthSessionTokenFromHeaders(req.headers);

    if (!token) {
      cleanupSocketSafely("missing-token");
      closeSocketIfNeeded(
        RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
        RUNTIME_WS_CLOSE_REASON_SESSION_INVALID,
      );
      return;
    }

    try {
      const tokenValidation = validateWsSessionToken(token, secret);
      if (!tokenValidation.ok) {
        cleanupSocketSafely(tokenValidation.reason);
        closeSocketIfNeeded(
          RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
          tokenValidation.reason === "expired_token"
            ? RUNTIME_WS_CLOSE_REASON_SESSION_EXPIRED
            : RUNTIME_WS_CLOSE_REASON_SESSION_INVALID,
        );
        return;
      }
      activityId = tokenValidation.activityId;

      if (isSessionRevoked(activityId)) {
        cleanupSocketSafely("revoked-session");
        closeSocketIfNeeded(
          RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
          RUNTIME_WS_CLOSE_REASON_SESSION_INVALID,
        );
        return;
      }

      const activity = await storage.getActivityById(activityId);
      if (cleanedUp || !isTrackableSocket(ws)) {
        cleanupSocketSafely("validation-race");
        return;
      }

      if (!isActiveWebSocketSession(activity)) {
        revokeSession(activityId);
        logger.debug("WebSocket rejected because the session is invalid or expired", {
          activityId,
        });
        cleanupSocketSafely("inactive-session");
        closeSocketIfNeeded(
          RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
          RUNTIME_WS_CLOSE_REASON_SESSION_INVALID,
        );
        return;
      }

      const userKey = getActivityUserKey(activity);
      if (userKey && countTrackedUserConnections(userKey, activityId) >= MAX_CONNECTIONS_PER_USER) {
        logger.warn("WebSocket rejected because the user connection limit was reached", {
          activityId,
          userKey,
          maxConnectionsPerUser: MAX_CONNECTIONS_PER_USER,
        });
        cleanupSocketSafely("user-limit");
        closeSocketIfNeeded();
        return;
      }

      const existingEntry = socketEntriesByActivity.get(activityId);
      const existingWs = existingEntry?.ws ?? connectedClients.get(activityId);
      socketEntry = registerTrackedSocketEntry(activityId, ws, userKey);
      touchTrackedSocket(true);
      markSocketAlive();

      if (cleanedUp || !isTrackableSocket(ws)) {
        cleanupSocketSafely("post-register-race");
        return;
      }

      if (existingWs && existingWs !== ws) {
        socketCleanupCallbacks.get(existingWs)?.();
        if (isTrackableSocket(existingWs)) {
          try {
            existingWs.close();
          } catch (error) {
            logger.debug("WebSocket close request failed during connection replacement cleanup", {
              activityId,
              error: sanitizeRuntimeWebSocketError(error),
            });
          }
        }
      }

      logger.debug("WebSocket connected", { activityId });
    } catch (error) {
      cleanupSocketSafely("handshake-catch");
      logger.warn("WebSocket handshake failed", {
        error: sanitizeRuntimeWebSocketError(error),
      });
      closeSocketIfNeeded();
    }
  };
}
