import { verifySessionJwt } from "../auth/session-jwt";
import { logger } from "../lib/logger";

type ActivitySessionLike = {
  id?: string | null;
  isActive?: boolean | null;
  logoutTime?: string | Date | null;
} | null | undefined;

type WsTokenPayload = {
  activityId?: string | null;
};

export function extractWsActivityId(token: string, secret: string | readonly string[]): string | null {
  if (!token || !secret) return null;

  try {
    const decoded = verifySessionJwt<WsTokenPayload>(token, secret);
    const activityId = String(decoded?.activityId || "").trim();
    return activityId || null;
  } catch (error) {
    logger.warn("WebSocket token verification failed", { error });
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
