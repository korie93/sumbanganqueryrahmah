import { useCallback } from "react";
import type { UseActivityDataStateOptions } from "@/pages/activity/activity-data-state-shared";
import { useActivityFeedState } from "@/pages/activity/useActivityFeedState";
import { useActivityFilterState } from "@/pages/activity/useActivityFilterState";

export function useActivityDataState({ canModerateActivity }: UseActivityDataStateOptions) {
  const filterState = useActivityFilterState();
  const { filtersRef, ...publicFilterState } = filterState;
  const feedState = useActivityFeedState({
    canModerateActivity,
    filtersRef,
  });
  const { fetchActivities } = feedState;

  const handleApplyFilters = useCallback(() => {
    void fetchActivities(true);
  }, [fetchActivities]);

  return {
    ...feedState,
    ...publicFilterState,
    handleApplyFilters,
  };
}
