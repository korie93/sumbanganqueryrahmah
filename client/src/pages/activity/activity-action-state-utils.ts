import type { BannedUser } from "@/pages/activity/types";
import type {
  ActivityActionToastPayload,
  ActivityBulkDeleteResult,
} from "@/pages/activity/activity-action-state-shared";

export function getActivityActionErrorDescription(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function removeSelectedActivityId(previous: Set<string>, activityId: string) {
  if (!previous.has(activityId)) {
    return previous;
  }

  const next = new Set(previous);
  next.delete(activityId);
  return next;
}

export function buildBulkDeleteToastPayload(
  response: ActivityBulkDeleteResult,
): ActivityActionToastPayload {
  const allDeleted = response.deletedCount === response.requestedCount;
  const protectedCount = response.protectedIds.length;
  const missingCount = response.notFoundIds.length;

  return {
    title: allDeleted ? "Success" : "Partial cleanup",
    description: allDeleted
      ? `${response.deletedCount} activity log(s) deleted.`
      : `${response.deletedCount} deleted, ${protectedCount} protected by active bans, ${missingCount} missing.`,
    variant: allDeleted ? "default" : "warning",
  };
}

export function getUnbanActionLoadingKey(user: Pick<BannedUser, "banId" | "username">) {
  return user.banId || user.username;
}
