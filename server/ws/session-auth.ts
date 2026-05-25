import { verifySessionJwt } from "../auth/session-jwt";
import { parseWebSocketSessionJwtPayload } from "../auth/session-jwt-payload";
import { logger } from "../lib/logger";

type ActivitySessionLike = {
  id?: string | null;
  isActive?: boolean | null;
  logoutTime?: string | Date | null;
} | null | undefined;

export function extractWsActivityId(token: string, secret: string | readonly string[]): string | null {
  if (!token || !secret) return null;

  try {
    const decoded = parseWebSocketSessionJwtPayload(verifySessionJwt<unknown>(token, secret));
    return decoded.activityId;
  } catch (error) {
    const authError = error as Error;
    logger.warn("WebSocket session token verification failed", {
      errorName: authError?.name,
      errorMessage: authError?.message,
    });
    return null;
  }
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
