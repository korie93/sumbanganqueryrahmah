import type { ActivityFilters } from "@/lib/api";
import type { ActivityRecord, ActivityStatus } from "@/pages/activity/types";

export function reconcileSelectedActivityIds(
  selectedActivityIds: Set<string>,
  activities: ActivityRecord[],
) {
  if (selectedActivityIds.size === 0) {
    return selectedActivityIds;
  }

  const validIds = new Set(activities.map((activity) => activity.id));
  let changed = false;
  const next = new Set<string>();

  for (const id of selectedActivityIds) {
    if (validIds.has(id)) {
      next.add(id);
    } else {
      changed = true;
    }
  }

  return changed ? next : selectedActivityIds;
}

export function toggleActivityStatusFilter(
  previous: ActivityFilters,
  status: ActivityStatus,
): ActivityFilters {
  const currentStatus = previous.status || [];
  return currentStatus.includes(status)
    ? { ...previous, status: currentStatus.filter((value) => value !== status) }
    : { ...previous, status: [...currentStatus, status] };
}

export function countSelectedVisibleActivities(
  activities: ActivityRecord[],
  selectedActivityIds: Set<string>,
) {
  let count = 0;
  for (const activity of activities) {
    if (selectedActivityIds.has(activity.id)) {
      count += 1;
    }
  }
  return count;
}

export function buildActivitySummaryCounts(activities: ActivityRecord[]) {
  let onlineCount = 0;
  let idleCount = 0;
  let logoutCount = 0;
  let kickedCount = 0;

  for (const activity of activities) {
    switch (activity.status) {
      case "ONLINE":
        onlineCount += 1;
        break;
      case "IDLE":
        idleCount += 1;
        break;
      case "LOGOUT":
        logoutCount += 1;
        break;
      case "KICKED":
        kickedCount += 1;
        break;
      default:
        break;
    }
  }

  return {
    idleCount,
    kickedCount,
    logoutCount,
    onlineCount,
  };
}
