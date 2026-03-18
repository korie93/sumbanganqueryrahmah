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
import { useCollectionDailyReceiptViewer } from "@/pages/collection/useCollectionDailyReceiptViewer";
import { parseApiError } from "@/pages/collection/utils";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

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
    return "Select at least one user to view Collection Daily.";
  }
  if (!canManage && !currentUsername) {
    return "Current user session could not be resolved.";
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

  const loadOverview = useCallback(async () => {
    if (
      !shouldLoadCollectionDailyOverview({
        canManage,
        currentUsername,
        selectedUsernames,
      })
    ) {
      setOverview(null);
      closeReceiptViewer();
      return;
    }

    const requestId = overviewRequestRef.current + 1;
    overviewRequestRef.current = requestId;
    setLoadingOverview(true);
    try {
      const response = await getCollectionDailyOverview({
        year,
        month,
        usernames: selectedQueryUsers,
      });
      if (overviewRequestRef.current !== requestId) return;
      setOverview(response);
      if (canEditTarget) {
        setMonthlyTargetInput(String(response.summary.monthlyTarget || 0));
      }
      setCalendarDays(mapCollectionDailyEditableCalendarDays(response));
      setSelectedDate(null);
      setDayDetails(null);
      closeReceiptViewer();
    } catch (error: unknown) {
      if (overviewRequestRef.current !== requestId) return;
      setOverview(null);
      toast({
        title: "Failed to Load Collection Daily",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (overviewRequestRef.current === requestId) {
        setLoadingOverview(false);
      }
    }
  }, [
    canEditTarget,
    canManage,
    closeReceiptViewer,
    currentUsername,
    month,
    selectedQueryUsers,
    selectedUsernames.length,
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
      setSelectedDate(date);
      setLoadingDayDetails(true);
      try {
        const response = await getCollectionDailyDayDetails({
          date,
          usernames: selectedQueryUsers,
          page,
          pageSize: DAY_DETAILS_PAGE_SIZE,
        });
        if (dayDetailsRequestRef.current !== requestId) return;
        setDayDetails(response);
      } catch (error: unknown) {
        if (dayDetailsRequestRef.current !== requestId) return;
        setDayDetails(null);
        toast({
          title: "Failed to Load Day Details",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (dayDetailsRequestRef.current === requestId) {
          setLoadingDayDetails(false);
        }
      }
    },
    [selectedQueryUsers, toast],
  );

  const saveMonthlyTarget = useCallback(async () => {
    if (!canManage) return;
    if (!canEditTarget) {
      toast({
        title: "Select One User",
        description: "Please select exactly one user to update monthly target.",
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
      await loadOverview();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Target",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSavingTarget(false);
    }
  }, [canEditTarget, canManage, loadOverview, month, monthlyTargetInput, selectedUsernames, toast, year]);

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
      await loadOverview();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Calendar",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSavingCalendar(false);
    }
  }, [calendarDays, loadOverview, month, toast, year]);

  const updateEditableDay = useCallback((dayNumber: number, patch: Partial<EditableCalendarDay>) => {
    setCalendarDays((previous) =>
      updateCollectionDailyEditableCalendarDay(previous, dayNumber, patch),
    );
  }, []);

  const closeDayDetails = useCallback(() => {
    setSelectedDate(null);
    setDayDetails(null);
    closeReceiptViewer();
  }, [closeReceiptViewer]);

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
    loadDayDetails,
    saveMonthlyTarget,
    saveCalendar,
    updateEditableDay,
    closeDayDetails,
    viewReceipt,
  };
}
