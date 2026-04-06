import type { ActivityRecord } from "@/pages/activity/types";

export function getActivityPageDescription(isMobile: boolean) {
  return isMobile
    ? "Monitor user activity and moderation events in real-time."
    : "Monitor user activity, moderation events, and session visibility in real-time.";
}

export function getActivityAccessLabel(canModerateActivity: boolean) {
  return canModerateActivity ? "Moderation enabled" : "Read-only view";
}

export function toggleActivitySelection(
  selectedActivityIds: Set<string>,
  activityId: string,
  checked: boolean,
) {
  const next = new Set(selectedActivityIds);
  if (checked) {
    next.add(activityId);
  } else {
    next.delete(activityId);
  }
  return next;
}

export function toggleAllVisibleActivitySelection(
  selectedActivityIds: Set<string>,
  activities: ActivityRecord[],
  checked: boolean,
) {
  const next = new Set(selectedActivityIds);

  for (const activity of activities) {
    if (checked) {
      next.add(activity.id);
    } else {
      next.delete(activity.id);
    }
  }

  return next;
}
