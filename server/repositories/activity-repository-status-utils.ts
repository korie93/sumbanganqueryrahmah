import type { UserActivity } from "../../shared/schema-postgres";
import { ACTIVITY_IDLE_STATUS_THRESHOLD_MINUTES } from "../activity/activity-session-policy";
import { resolveTimestampMs } from "../lib/timestamp";

export function computeActivityStatus(activity: UserActivity): string {
  if (!activity.isActive) {
    if (activity.logoutReason === "KICKED") return "KICKED";
    if (activity.logoutReason === "BANNED") return "BANNED";
    return "LOGOUT";
  }

  if (activity.lastActivityTime) {
    const lastActive = resolveTimestampMs(activity.lastActivityTime);
    const diffMinutes = Math.floor((Date.now() - lastActive) / 60_000);
    if (diffMinutes >= ACTIVITY_IDLE_STATUS_THRESHOLD_MINUTES) return "IDLE";
  }

  return "ONLINE";
}
