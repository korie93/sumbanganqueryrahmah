import type { ActivityRecord } from "@/pages/activity/types";
import {
  toggleActivitySelection,
  toggleAllVisibleActivitySelection,
} from "@/pages/activity/activity-page-utils";

export function shouldRenderBannedUsersSection(
  canModerateActivity: boolean,
  bannedUsersCount: number,
) {
  return canModerateActivity && bannedUsersCount > 0;
}

export function updateActivitySelection(
  selectedActivityIds: Set<string>,
  activityId: string,
  checked: boolean,
) {
  return toggleActivitySelection(selectedActivityIds, activityId, checked);
}

export function updateAllVisibleActivitySelection(
  selectedActivityIds: Set<string>,
  activities: ActivityRecord[],
  checked: boolean,
) {
  return toggleAllVisibleActivitySelection(selectedActivityIds, activities, checked);
}
