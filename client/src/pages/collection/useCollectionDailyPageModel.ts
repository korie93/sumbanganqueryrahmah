import { useCallback, useMemo } from "react";
import { getCurrentUsername } from "@/pages/collection/utils";
import {
  MAX_COLLECTION_DAILY_YEAR,
  MIN_COLLECTION_DAILY_YEAR,
  useCollectionDailyPeriod,
} from "@/pages/collection/useCollectionDailyPeriod";
import { useCollectionDailyData } from "@/pages/collection/useCollectionDailyData";
import { useCollectionDailyUserSelection } from "@/pages/collection/useCollectionDailyUserSelection";
import { useCollectionDailyUsersData } from "@/pages/collection/useCollectionDailyUsersData";

type UseCollectionDailyPageModelOptions = {
  role: string;
};

export function useCollectionDailyPageModel({ role }: UseCollectionDailyPageModelOptions) {
  const now = useMemo(() => new Date(), []);
  const canManage = role === "admin" || role === "superuser";
  const currentUsername = useMemo(() => getCurrentUsername(), []);

  const {
    year,
    month,
    yearInput,
    monthInput,
    setYearInput,
    setMonthInput,
    commitYearInput,
    commitMonthInput,
  } = useCollectionDailyPeriod(now);

  const usersData = useCollectionDailyUsersData({ canManage });

  const userSelection = useCollectionDailyUserSelection({
    canManage,
    currentUsername,
    users: usersData.users,
  });

  const data = useCollectionDailyData({
    canManage,
    currentUsername,
    year,
    month,
    selectedUsernames: userSelection.selectedUsernames,
    selectedQueryUsers: userSelection.selectedQueryUsers,
    canEditTarget: userSelection.canEditTarget,
  });

  const handleRefresh = useCallback(() => {
    const nextYear = commitYearInput();
    const nextMonth = commitMonthInput();
    if (nextYear === year && nextMonth === month) void data.loadOverview();
  }, [commitMonthInput, commitYearInput, data, month, year]);

  const handleDaySelect = useCallback((date: string) => {
    void data.loadDayDetails(date, 1);
  }, [data]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) data.closeDayDetails();
  }, [data]);

  const handleViewReceipt = useCallback((recordId: string, receiptId?: string) => {
    void data.viewReceipt(recordId, receiptId);
  }, [data]);

  const handleDialogPageChange = useCallback((page: number) => {
    if (data.selectedDate) {
      void data.loadDayDetails(data.selectedDate, page);
    }
  }, [data]);

  const handleSaveTarget = useCallback(() => {
    void data.saveMonthlyTarget();
  }, [data]);

  const handleSaveCalendar = useCallback(() => {
    void data.saveCalendar();
  }, [data]);

  return {
    canManage,
    currentUsername,
    overview: data.overview,
    filtersCardProps: {
      canManage,
      currentUsername,
      yearInput,
      monthInput,
      minYear: MIN_COLLECTION_DAILY_YEAR,
      maxYear: MAX_COLLECTION_DAILY_YEAR,
      onYearInputChange: setYearInput,
      onMonthInputChange: setMonthInput,
      onYearCommit: commitYearInput,
      onMonthCommit: commitMonthInput,
      userPopoverOpen: userSelection.userPopoverOpen,
      onUserPopoverOpenChange: userSelection.setUserPopoverOpen,
      loadingUsers: usersData.loadingUsers,
      selectedUsersLabel: userSelection.selectedUsersLabel,
      users: usersData.users,
      selectedUserSet: userSelection.selectedUserSet,
      allUsersSelected: userSelection.allUsersSelected,
      partiallySelected: userSelection.partiallySelected,
      selectedUsernamesCount: userSelection.selectedUsernamesCount,
      onToggleSelectedUser: userSelection.toggleSelectedUser,
      onSelectAllUsers: userSelection.selectAllUsers,
      onClearSelectedUsers: userSelection.clearSelectedUsers,
      loadingOverview: data.loadingOverview,
      onRefresh: handleRefresh,
      monthlyTargetInput: data.monthlyTargetInput,
      onMonthlyTargetInputChange: data.setMonthlyTargetInput,
      canEditTarget: userSelection.canEditTarget,
      savingTarget: data.savingTarget,
      onSaveTarget: handleSaveTarget,
      savingCalendar: data.savingCalendar,
      onSaveCalendar: handleSaveCalendar,
      calendarDays: data.calendarDays,
    },
    calendarCardProps: {
      loadingOverview: data.loadingOverview,
      overview: data.overview,
      emptyOverviewMessage: data.emptyOverviewMessage,
      firstWeekday: data.firstWeekday,
      selectedDate: data.selectedDate,
      canManage,
      editableCalendarByDay: data.editableCalendarByDay,
      onSelectDate: handleDaySelect,
      onUpdateEditableDay: data.updateEditableDay,
    },
    dayDetailsDialogProps: {
      open: Boolean(data.selectedDate),
      selectedDate: data.selectedDate,
      loadingDayDetails: data.loadingDayDetails,
      dayDetails: data.dayDetails,
      selectedOverviewDay: data.selectedOverviewDay,
      loadingReceiptKey: data.loadingReceiptKey,
      onOpenChange: handleDialogOpenChange,
      onViewReceipt: handleViewReceipt,
      onChangePage: handleDialogPageChange,
    },
  };
}
