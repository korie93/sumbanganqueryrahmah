import { useEffect, useMemo, useState } from "react";
import {
  countSelectedVisibleActivities,
  reconcileSelectedActivityIds,
} from "@/pages/activity/activity-page-state-utils";
import type { ActivityRecord } from "@/pages/activity/types";

type UseActivitySelectionStateOptions = {
  activities: ActivityRecord[];
};

export function useActivitySelectionState({ activities }: UseActivitySelectionStateOptions) {
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedActivityIds((previous) => reconcileSelectedActivityIds(previous, activities));
  }, [activities]);

  const selectedVisibleCount = useMemo(
    () => countSelectedVisibleActivities(activities, selectedActivityIds),
    [activities, selectedActivityIds],
  );
  const allVisibleSelected = activities.length > 0 && selectedVisibleCount === activities.length;
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected;

  return {
    selectedActivityIds,
    setSelectedActivityIds,
    selectedVisibleCount,
    allVisibleSelected,
    partiallySelected,
  };
}
