import type { ActivityRecord, ActivityStatus } from "@/pages/activity/types";

export function countActivitiesByStatus(activities: ActivityRecord[], status: ActivityStatus) {
  return activities.filter((activity) => activity.status === status).length;
}
