import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCollectionDailyDayDetails,
  getCollectionDailyOverview,
  setCollectionDailyCalendar,
  setCollectionDailyTarget,
  type CollectionDailyDayDetailsResponse,
  type CollectionDailyOverviewResponse,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import {
  buildCollectionDailyDayDetailsCacheKey,
  buildCollectionDailyOverviewCacheKey,
  createCollectionDailyDayDetailsCache,
  createCollectionDailyOverviewCache,
} from "@/pages/collection/collection-daily-cache";
import { useCollectionDailyReceiptViewer } from "@/pages/collection/useCollectionDailyReceiptViewer";
import {
  COLLECTION_DATA_CHANGED_EVENT,
  parseApiError,
} from "@/pages/collection/utils";

const DAY_DETAILS_PAGE_SIZE = 10;

type UseCollectionDailyDataOptions = {
  canManage: boolean;
  currentUsername: string;
  year: number;
  month: number;
  selectedUsernames: string[];
  selectedQueryUsers?: string[];
  canEditTarget: boolean;
};

type LoadCollectionDailyOverviewOptions = {
  preserveSelection?: boolean;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function shouldLoadCollectionDailyOverview(options: {
  canManage: boolean;
  currentUsername: string;
  selectedUsernames: string[];
}) {
  const { canManage, currentUsername, selectedUsernames } = options;
  if (canManage && selectedUsernames.length === 0) return false;
  if (!canManage && !currentUsername) return false;
  return true;
}

export function getCollectionDailyEmptyOverviewMessage(options: {
  canManage: boolean;
  currentUsername: string;
  selectedUsernames: string[];
}) {
  const { canManage, currentUsername, selectedUsernames } = options;
  if (canManage && selectedUsernames.length === 0) {
    return "Select at least one staff nickname to view Collection Daily.";
  }
  if (!canManage && !currentUsername) {
    return "Current staff nickname session could not be resolved.";
  }
  return "No overview data found.";
}

export function mapCollectionDailyEditableCalendarDays(
  response: CollectionDailyOverviewResponse,
): EditableCalendarDay[] {
  return response.days.map((day) => ({
    day: day.day,
    isWorkingDay: day.isWorkingDay,
    isHoliday: day.isHoliday,
    holidayName: day.holidayName || "",
  }));
}

export function buildCollectionDailyCalendarPayloadDays(calendarDays: EditableCalendarDay[]) {
  return calendarDays.map((day) => ({
    day: day.day,
    isWorkingDay: day.isWorkingDay,
    isHoliday: day.isHoliday,
    holidayName: day.holidayName || null,
  }));
}

export function updateCollectionDailyEditableCalendarDay(
  previous: EditableCalendarDay[],
  dayNumber: number,
  patch: Partial<EditableCalendarDay>,
) {
  return previous.map((item) => (item.day === dayNumber ? { ...item, ...patch } : item));
}

export function getCollectionDailyFirstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

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
  const overviewRequestRef = useRef(0);
  const dayDetailsRequestRef = useRef(0);
  const overviewAbortControllerRef = useRef<AbortController | null>(null);
  const dayDetailsAbortControllerRef = useRef<AbortController | null>(null);
  const overviewCacheRef = useRef(createCollectionDailyOverviewCache());
  const dayDetailsCacheRef = useRef(createCollectionDailyDayDetailsCache());

  const [overview, setOverview] = useState<CollectionDailyOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [monthlyTargetInput, setMonthlyTargetInput] = useState("0");
  const [calendarDays, setCalendarDays] = useState<EditableCalendarDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<CollectionDailyDayDetailsResponse | null>(null);
  const [loadingDayDetails, setLoadingDayDetails] = useState(false);
  const {
    loadingReceiptKey,
    openReceiptViewer,
    closeReceiptViewer,
    receiptPreviewDialogProps,
  } = useCollectionDailyReceiptViewer();

  const abortOverviewRequest = useCallback(() => {
    if (overviewAbortControllerRef.current) {
      overviewAbortControllerRef.current.abort();
      overviewAbortControllerRef.current = null;
    }
  }, []);

  const abortDayDetailsRequest = useCallback(() => {
    if (dayDetailsAbortControllerRef.current) {
      dayDetailsAbortControllerRef.current.abort();
      dayDetailsAbortControllerRef.current = null;
    }
  }, []);

  const clearCachedDailyViews = useCallback(() => {
    overviewCacheRef.current.clear();
    dayDetailsCacheRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      abortOverviewRequest();
      abortDayDetailsRequest();
      clearCachedDailyViews();
    };
  }, [abortDayDetailsRequest, abortOverviewRequest, clearCachedDailyViews]);

  const loadOverview = useCallback(async (
    options: LoadCollectionDailyOverviewOptions = {},
  ): Promise<boolean> => {
    const preserveSelection = options.preserveSelection === true;
    if (
      !shouldLoadCollectionDailyOverview({
        canManage,
        currentUsername,
        selectedUsernames,
      })
    ) {
      setOverview(null);
      if (!preserveSelection) {
        setSelectedDate(null);
        setDayDetails(null);
        closeReceiptViewer();
      }
      return false;
    }

    const requestId = overviewRequestRef.current + 1;
    overviewRequestRef.current = requestId;
    const cacheKey = buildCollectionDailyOverviewCacheKey({
      year,
      month,
      usernames: selectedQueryUsers,
    });
    const cachedEntry = overviewCacheRef.current.get(cacheKey);

    if (cachedEntry) {
      abortOverviewRequest();
      setOverview(cachedEntry.overview);
      if (canEditTarget) {
        setMonthlyTargetInput(String(cachedEntry.overview.summary.monthlyTarget || 0));
      }
      setCalendarDays(mapCollectionDailyEditableCalendarDays(cachedEntry.overview));
      if (!preserveSelection) {
        setSelectedDate(null);
        setDayDetails(null);
        closeReceiptViewer();
      }
      setLoadingOverview(false);
      return true;
    }

    abortOverviewRequest();
    const controller = new AbortController();
    overviewAbortControllerRef.current = controller;
    setLoadingOverview(true);

    try {
      const response = await getCollectionDailyOverview(
        {
          year,
          month,
          usernames: selectedQueryUsers,
        },
        {
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted || overviewRequestRef.current !== requestId) return false;
      overviewCacheRef.current.set(cacheKey, { overview: response });
      setOverview(response);
      if (canEditTarget) {
        setMonthlyTargetInput(String(response.summary.monthlyTarget || 0));
      }
      setCalendarDays(mapCollectionDailyEditableCalendarDays(response));
      if (!preserveSelection) {
        setSelectedDate(null);
        setDayDetails(null);
        closeReceiptViewer();
      }
      return true;
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) return false;
      if (overviewRequestRef.current !== requestId) return false;
      setOverview(null);
      toast({
        title: "Failed to Load Collection Daily",
        description: parseApiError(error),
        variant: "destructive",
      });
      return false;
    } finally {
      if (overviewAbortControllerRef.current === controller) {
        overviewAbortControllerRef.current = null;
      }
      if (overviewRequestRef.current === requestId) {
        setLoadingOverview(false);
      }
    }
  }, [
    abortOverviewRequest,
    canEditTarget,
    canManage,
    closeReceiptViewer,
    currentUsername,
    month,
    selectedQueryUsers,
    selectedUsernames,
    toast,
    year,
  ]);

  useEffect(() => {
    if (
      !shouldLoadCollectionDailyOverview({
        canManage,
        currentUsername,
        selectedUsernames,
      })
    ) {
      return;
    }
    void loadOverview();
  }, [canManage, currentUsername, loadOverview, selectedUsernames]);

  const loadDayDetails = useCallback(
    async (date: string, page = 1) => {
      const requestId = dayDetailsRequestRef.current + 1;
      dayDetailsRequestRef.current = requestId;
      const cacheKey = buildCollectionDailyDayDetailsCacheKey({
        date,
        usernames: selectedQueryUsers,
        page,
        pageSize: DAY_DETAILS_PAGE_SIZE,
      });
      const cachedEntry = dayDetailsCacheRef.current.get(cacheKey);

      setSelectedDate(date);

      if (cachedEntry) {
        abortDayDetailsRequest();
        setDayDetails(cachedEntry.dayDetails);
        setLoadingDayDetails(false);
        return;
      }

      abortDayDetailsRequest();
      const controller = new AbortController();
      dayDetailsAbortControllerRef.current = controller;
      setLoadingDayDetails(true);

      try {
        const response = await getCollectionDailyDayDetails(
          {
            date,
            usernames: selectedQueryUsers,
            page,
            pageSize: DAY_DETAILS_PAGE_SIZE,
          },
          {
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted || dayDetailsRequestRef.current !== requestId) return;
        dayDetailsCacheRef.current.set(cacheKey, { dayDetails: response });
        setDayDetails(response);
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) return;
        if (dayDetailsRequestRef.current !== requestId) return;
        setDayDetails(null);
        toast({
          title: "Failed to Load Day Details",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (dayDetailsAbortControllerRef.current === controller) {
          dayDetailsAbortControllerRef.current = null;
        }
        if (dayDetailsRequestRef.current === requestId) {
          setLoadingDayDetails(false);
        }
      }
    },
    [abortDayDetailsRequest, selectedQueryUsers, toast],
  );

  const refreshCurrentView = useCallback(async () => {
    const activeDate = selectedDate;
    const activePage = dayDetails?.pagination.page || 1;
    const didLoadOverview = await loadOverview({
      preserveSelection: Boolean(activeDate),
    });
    if (didLoadOverview && activeDate) {
      await loadDayDetails(activeDate, activePage);
    }
  }, [dayDetails?.pagination.page, loadDayDetails, loadOverview, selectedDate]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleCollectionDataChanged = () => {
      clearCachedDailyViews();
      if (
        !shouldLoadCollectionDailyOverview({
          canManage,
          currentUsername,
          selectedUsernames,
        })
      ) {
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

  const saveMonthlyTarget = useCallback(async () => {
    if (!canManage) return;
    if (!canEditTarget) {
      toast({
        title: "Select One Staff Nickname",
        description: "Please select exactly one staff nickname to update monthly target.",
        variant: "destructive",
      });
      return;
    }
    const monthlyTarget = Number(monthlyTargetInput);
    if (!Number.isFinite(monthlyTarget) || monthlyTarget < 0) {
      toast({
        title: "Validation Error",
        description: "Monthly target must be a non-negative number.",
        variant: "destructive",
      });
      return;
    }
    setSavingTarget(true);
    try {
      await setCollectionDailyTarget({
        username: selectedUsernames[0],
        year,
        month,
        monthlyTarget,
      });
      toast({
        title: "Target Saved",
        description: "Monthly target has been updated.",
      });
      clearCachedDailyViews();
      await refreshCurrentView();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Target",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSavingTarget(false);
    }
  }, [
    canEditTarget,
    canManage,
    clearCachedDailyViews,
    month,
    monthlyTargetInput,
    refreshCurrentView,
    selectedUsernames,
    toast,
    year,
  ]);

  const saveCalendar = useCallback(async () => {
    if (!calendarDays.length) return;
    setSavingCalendar(true);
    try {
      await setCollectionDailyCalendar({
        year,
        month,
        days: buildCollectionDailyCalendarPayloadDays(calendarDays),
      });
      toast({
        title: "Calendar Saved",
        description: "Working days and holiday settings have been updated.",
      });
      clearCachedDailyViews();
      await refreshCurrentView();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Calendar",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSavingCalendar(false);
    }
  }, [calendarDays, clearCachedDailyViews, month, refreshCurrentView, toast, year]);

  const updateEditableDay = useCallback((dayNumber: number, patch: Partial<EditableCalendarDay>) => {
    setCalendarDays((previous) =>
      updateCollectionDailyEditableCalendarDay(previous, dayNumber, patch),
    );
  }, []);

  const closeDayDetails = useCallback(() => {
    abortDayDetailsRequest();
    setSelectedDate(null);
    setDayDetails(null);
    closeReceiptViewer();
  }, [abortDayDetailsRequest, closeReceiptViewer]);

  const viewReceipt = useCallback(
    (record: CollectionDailyDayDetailsResponse["records"][number], receiptId?: string) => {
      openReceiptViewer(record, receiptId);
    },
    [openReceiptViewer],
  );

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
    savingTarget,
    savingCalendar,
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
    loadOverview,
    refreshCurrentView,
    loadDayDetails,
    saveMonthlyTarget,
    saveCalendar,
    updateEditableDay,
    closeDayDetails,
    viewReceipt,
  };
}
