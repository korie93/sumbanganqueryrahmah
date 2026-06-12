import { useCallback } from "react";
import type { UseActivityDataStateOptions } from "@/pages/activity/activity-data-state-shared";
import { useActivityFeedState } from "@/pages/activity/useActivityFeedState";
import { useActivityFilterState } from "@/pages/activity/useActivityFilterState";

export function useActivityDataState({ canModerateActivity }: UseActivityDataStateOptions) {
  const filterState = useActivityFilterState();
  const {
    filtersRef,
    handleClearFilters: resetFilters,
    ...publicFilterState
  } = filterState;
  const feedState = useActivityFeedState({
    canModerateActivity,
    filtersRef,
  });
  const { requestActivityPage } = feedState;

  const handleApplyFilters = useCallback(() => {
    requestActivityPage(true, { page: 1 });
  }, [requestActivityPage]);

  const handleClearFilters = useCallback(() => {
    resetFilters();
    requestActivityPage(false, { page: 1 });
  }, [requestActivityPage, resetFilters]);

  return {
    ...feedState,
    ...publicFilterState,
    handleApplyFilters,
    handleClearFilters,
  };
}
