import jwt from "jsonwebtoken";

type ActivitySessionLike = {
  id?: string | null;
  isActive?: boolean | null;
  logoutTime?: string | Date | null;
} | null | undefined;

type WsTokenPayload = {
  activityId?: string | null;
};

export function extractWsActivityId(token: string, secret: string): string | null {
  if (!token || !secret) return null;

  try {
    const decoded = jwt.verify(token, secret) as WsTokenPayload;
    const activityId = String(decoded?.activityId || "").trim();
    return activityId || null;
  } catch {
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
