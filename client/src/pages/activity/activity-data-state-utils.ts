import type { ActivityFilters } from "@/lib/api";
import { hasActiveActivityFilters } from "@/pages/activity/utils";

export function shouldUseFilteredActivityFetch(filters: ActivityFilters, useFilters: boolean) {
  return useFilters && hasActiveActivityFilters(filters);
}

export function shouldAutoRefreshVisibleActivity(
  filters: ActivityFilters,
  visibilityState?: DocumentVisibilityState,
) {
  return !hasActiveActivityFilters(filters) && (visibilityState === undefined || visibilityState === "visible");
}
