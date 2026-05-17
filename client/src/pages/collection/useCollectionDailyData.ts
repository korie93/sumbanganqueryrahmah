import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectionDailyDayDetailsResponse } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionDailyEmptyOverviewMessage,
  getCollectionDailyFirstWeekday,
  selectCollectionDailyDirtyCalendarDays,
  shouldLoadCollectionDailyOverview,
  updateCollectionDailyEditableCalendarDay,
  updateCollectionDailyEditableCalendarDays,
} from "@/pages/collection/collection-daily-state-utils";
import { useCollectionDailyDayDetailsState } from "@/pages/collection/useCollectionDailyDayDetailsState";
import { useCollectionDailyMutationState } from "@/pages/collection/useCollectionDailyMutationState";
import { useCollectionDailyOverviewState } from "@/pages/collection/useCollectionDailyOverviewState";
import { useCollectionDailyReceiptViewer } from "@/pages/collection/useCollectionDailyReceiptViewer";
import { COLLECTION_DATA_CHANGED_EVENT } from "@/pages/collection/utils";

export {
  buildCollectionDailyCalendarPayloadDays,
  getCollectionDailyEmptyOverviewMessage,
  getCollectionDailyFirstWeekday,
  mapCollectionDailyEditableCalendarDays,
  selectCollectionDailyDirtyCalendarDays,
  shouldLoadCollectionDailyOverview,
  updateCollectionDailyEditableCalendarDay,
  updateCollectionDailyEditableCalendarDays,
} from "@/pages/collection/collection-daily-state-utils";

type UseCollectionDailyDataOptions = {
  canManage: boolean;
  currentUsername: string;
  year: number;
  month: number;
  selectedUsernames: string[];
  selectedQueryUsers?: string[] | undefined;
  canEditTarget: boolean;
  canEditCalendar: boolean;
};

type CollectionDailyDayRecord = CollectionDailyDayDetailsResponse["records"][number];

export function useCollectionDailyData({
  canManage,
  currentUsername,
  year,
  month,
  selectedUsernames,
  selectedQueryUsers,
  canEditTarget,
  canEditCalendar,
}: UseCollectionDailyDataOptions) {
  const { toast } = useToast();
  const [dirtyCalendarDayNumbers, setDirtyCalendarDayNumbers] = useState<Set<number>>(
    () => new Set(),
  );
  const {
    loadingReceiptKey,
    openReceiptViewer,
    closeReceiptViewer,
    receiptPreviewDialogProps,
  } = useCollectionDailyReceiptViewer();

  const {
    selectedDate,
    dayDetails,
    loadingDayDetails,
    loadDayDetails,
    clearSelection,
    clearDayDetailsCache,
  } = useCollectionDailyDayDetailsState({
    selectedQueryUsers,
    onCloseRelatedUi: closeReceiptViewer,
    toast,
  });

  const {
    overview,
    loadingOverview,
    monthlyTargetInput,
    setMonthlyTargetInput,
    calendarDays,
    setCalendarDays,
    loadOverview,
    clearOverviewCache,
  } = useCollectionDailyOverviewState({
    canManage,
    currentUsername,
    year,
    month,
    selectedUsernames,
    selectedQueryUsers,
    canEditTarget,
    onClearSelection: clearSelection,
    toast,
  });

  const clearCachedDailyViews = useCallback(() => {
    clearOverviewCache();
    clearDayDetailsCache();
  }, [clearDayDetailsCache, clearOverviewCache]);

  const selectedUsernamesKey = useMemo(() => selectedUsernames.join("\u001f"), [selectedUsernames]);

  const clearDirtyCalendarDays = useCallback(() => {
    setDirtyCalendarDayNumbers((previous) => (previous.size > 0 ? new Set() : previous));
  }, []);

  useEffect(() => {
    clearDirtyCalendarDays();
  }, [clearDirtyCalendarDays, month, selectedUsernamesKey, year]);

  useEffect(() => {
    if (!shouldLoadCollectionDailyOverview({ canManage, currentUsername, selectedUsernames })) {
      return;
    }

    void loadOverview();
  }, [
    canManage,
    currentUsername,
    loadOverview,
    selectedUsernames,
  ]);

  const refreshCurrentView = useCallback(async () => {
    clearCachedDailyViews();
    const activeDate = selectedDate;
    const activePage = dayDetails?.pagination.page || 1;
    const didLoadOverview = await loadOverview({
      preserveSelection: Boolean(activeDate),
    });
    if (didLoadOverview) {
      clearDirtyCalendarDays();
    }

    if (didLoadOverview && activeDate) {
      await loadDayDetails(activeDate, activePage);
    }
  }, [
    clearCachedDailyViews,
    clearDirtyCalendarDays,
    dayDetails,
    loadDayDetails,
    loadOverview,
    selectedDate,
  ]);

  const dirtyCalendarDays = useMemo(
    () => selectCollectionDailyDirtyCalendarDays(calendarDays, dirtyCalendarDayNumbers),
    [calendarDays, dirtyCalendarDayNumbers],
  );

  const mutationState = useCollectionDailyMutationState({
    canManage,
    canEditTarget,
    canEditCalendar,
    year,
    month,
    selectedUsernames,
    monthlyTargetInput,
    calendarDaysToSave: dirtyCalendarDays,
    onRefresh: refreshCurrentView,
    onCalendarSaved: clearDirtyCalendarDays,
    toast,
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleCollectionDataChanged = () => {
      clearCachedDailyViews();
      if (!shouldLoadCollectionDailyOverview({ canManage, currentUsername, selectedUsernames })) {
        return;
      }

      void refreshCurrentView();
    };

    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    return () => {
      window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    };
  }, [
    canManage,
    clearCachedDailyViews,
    currentUsername,
    refreshCurrentView,
    selectedUsernames,
  ]);

  const updateEditableDay = useCallback((dayNumber: number, patch: Partial<EditableCalendarDay>) => {
    setCalendarDays((previous) =>
      updateCollectionDailyEditableCalendarDay(previous, dayNumber, patch),
    );
    setDirtyCalendarDayNumbers((previous) => {
      if (previous.has(dayNumber)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(dayNumber);
      return next;
    });
  }, [setCalendarDays]);

  const updateEditableDays = useCallback((dayNumbers: readonly number[], patch: Partial<EditableCalendarDay>) => {
    if (dayNumbers.length === 0) return;
    setCalendarDays((previous) =>
      updateCollectionDailyEditableCalendarDays(previous, dayNumbers, patch),
    );
    setDirtyCalendarDayNumbers((previous) => {
      const next = new Set(previous);
      for (const dayNumber of dayNumbers) {
        next.add(dayNumber);
      }
      return next.size === previous.size ? previous : next;
    });
  }, [setCalendarDays]);

  const closeDayDetails = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const viewReceipt = useCallback((record: CollectionDailyDayRecord, receiptId?: string) => {
    openReceiptViewer(record, receiptId);
  }, [openReceiptViewer]);

  const editableCalendarByDay = useMemo(
    () => new Map(calendarDays.map((day) => [day.day, day])),
    [calendarDays],
  );

  const selectedOverviewDay = useMemo(
    () => overview?.days.find((day) => day.date === selectedDate) || null,
    [overview, selectedDate],
  );

  const emptyOverviewMessage = useMemo(
    () =>
      getCollectionDailyEmptyOverviewMessage({
        canManage,
        currentUsername,
        selectedUsernames,
      }),
    [canManage, currentUsername, selectedUsernames],
  );

  const firstWeekday = useMemo(() => getCollectionDailyFirstWeekday(year, month), [month, year]);

  return {
    overview,
    loadingOverview,
    savingTarget: mutationState.savingTarget,
    savingCalendar: mutationState.savingCalendar,
    monthlyTargetInput,
    setMonthlyTargetInput,
    calendarDays,
    selectedDate,
    dayDetails,
    loadingDayDetails,
    loadingReceiptKey,
    receiptPreviewDialogProps,
    editableCalendarByDay,
    dirtyCalendarDayNumbers,
    dirtyCalendarDaysCount: dirtyCalendarDayNumbers.size,
    selectedOverviewDay,
    emptyOverviewMessage,
    firstWeekday,
    loadDayDetails,
    refreshCurrentView,
    saveMonthlyTarget: mutationState.saveMonthlyTarget,
    saveCalendar: mutationState.saveCalendar,
    updateEditableDay,
    updateEditableDays,
    closeDayDetails,
    viewReceipt,
  };
}
