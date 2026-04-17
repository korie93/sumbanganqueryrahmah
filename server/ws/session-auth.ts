import type { TokenExpiredError } from "jsonwebtoken";
import { verifySessionJwt } from "../auth/session-jwt";
import { logger } from "../lib/logger";
import { WS_SESSION_CLOCK_TOLERANCE_SECONDS } from "./ws-runtime-types";

type ActivitySessionLike = {
  id?: string | null;
  isActive?: boolean | null;
  logoutTime?: string | Date | null;
} | null | undefined;

type WsTokenPayload = {
  activityId?: string | null;
};

export type WsSessionTokenValidationResult =
  | {
      ok: true;
      activityId: string;
    }
  | {
      ok: false;
      reason: "expired_token" | "invalid_token" | "missing_activity_id";
    };

export function validateWsSessionToken(
  token: string,
  secret: string | readonly string[],
): WsSessionTokenValidationResult {
  if (!token || !secret) {
    return {
      ok: false,
      reason: "invalid_token",
    };
  }

  try {
    const decoded = verifySessionJwt<WsTokenPayload>(token, secret, {
      clockToleranceSeconds: WS_SESSION_CLOCK_TOLERANCE_SECONDS,
    });
    const activityId = String(decoded?.activityId || "").trim();
    if (!activityId) {
      return {
        ok: false,
        reason: "missing_activity_id",
      };
    }

    return {
      ok: true,
      activityId,
    };
  } catch (error) {
    const authError = error as Error & Partial<TokenExpiredError>;
    const reason = authError?.name === "TokenExpiredError" ? "expired_token" : "invalid_token";
    logger.warn("WebSocket session token verification failed", {
      errorName: authError?.name,
      errorMessage: authError?.message,
      reason,
    });
    return {
      ok: false,
      reason,
    };
  }
}

export function extractWsActivityId(token: string, secret: string | readonly string[]): string | null {
  const result = validateWsSessionToken(token, secret);
  return result.ok ? result.activityId : null;
}

export function isActiveWebSocketSession(activity: ActivitySessionLike): activity is {
  id: string;
  isActive?: boolean | null;
  logoutTime?: string | Date | null;
} {
  if (!activity) return false;

  const activityId = String(activity.id || "").trim();
  if (!activityId) return false;
  if (activity.isActive === false) return false;

  return activity.logoutTime == null;
}
