import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_COLLECTION_DAILY_CALENDAR_VIEW_MODE,
  readCollectionDailyCalendarViewModePreference,
  writeCollectionDailyCalendarViewModePreference,
  type CollectionDailyCalendarViewMode,
} from "@/pages/collection/collection-daily-calendar-view-mode-utils";

export function useCollectionDailyCalendarViewMode() {
  const [viewMode, setViewModeState] = useState<CollectionDailyCalendarViewMode>(
    DEFAULT_COLLECTION_DAILY_CALENDAR_VIEW_MODE,
  );

  useEffect(() => {
    setViewModeState(readCollectionDailyCalendarViewModePreference());
  }, []);

  const setViewMode = useCallback((nextMode: CollectionDailyCalendarViewMode) => {
    setViewModeState(nextMode);
    writeCollectionDailyCalendarViewModePreference(nextMode);
  }, []);

  return {
    viewMode,
    setViewMode,
  };
}
