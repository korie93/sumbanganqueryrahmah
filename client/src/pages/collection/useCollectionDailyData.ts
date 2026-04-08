import { useCallback, useEffect, useMemo } from "react";
import type { CollectionDailyDayDetailsResponse } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionDailyEmptyOverviewMessage,
  getCollectionDailyFirstWeekday,
  shouldLoadCollectionDailyOverview,
  updateCollectionDailyEditableCalendarDay,
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
  shouldLoadCollectionDailyOverview,
  updateCollectionDailyEditableCalendarDay,
} from "@/pages/collection/collection-daily-state-utils";

type UseCollectionDailyDataOptions = {
  canManage: boolean;
  currentUsername: string;
  year: number;
  month: number;
  selectedUsernames: string[];
  selectedQueryUsers?: string[] | undefined;
  canEditTarget: boolean;
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
}: UseCollectionDailyDataOptions) {
  const { toast } = useToast();
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

    if (didLoadOverview && activeDate) {
      await loadDayDetails(activeDate, activePage);
    }
  }, [clearCachedDailyViews, dayDetails, loadDayDetails, loadOverview, selectedDate]);

  const mutationState = useCollectionDailyMutationState({
    canManage,
    canEditTarget,
    year,
    month,
    selectedUsernames,
    monthlyTargetInput,
    calendarDays,
    onRefresh: refreshCurrentView,
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
    selectedOverviewDay,
    emptyOverviewMessage,
    firstWeekday,
    loadDayDetails,
    refreshCurrentView,
    saveMonthlyTarget: mutationState.saveMonthlyTarget,
    saveCalendar: mutationState.saveCalendar,
    updateEditableDay,
    closeDayDetails,
    viewReceipt,
  };
}
