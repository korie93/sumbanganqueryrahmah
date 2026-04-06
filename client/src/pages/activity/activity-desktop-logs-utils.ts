import type { ActivityRecord, ParsedBrowserInfo } from "@/pages/activity/types";

export function getActivityBrowserText({ browser, version }: ParsedBrowserInfo) {
  return version ? `${browser} ${version}` : browser;
}

export function canKickActivity(activity: Pick<ActivityRecord, "isActive">) {
  return activity.isActive;
}

export function canBanActivity(activity: Pick<ActivityRecord, "isActive" | "role">) {
  return activity.isActive && activity.role !== "superuser";
}
