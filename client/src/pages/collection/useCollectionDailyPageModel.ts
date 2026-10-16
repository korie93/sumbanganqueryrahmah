import { createElement, useCallback, useMemo, useState } from "react";
import type { CollectionDailyDayDetailsResponse } from "@/lib/api";
import {
  getCurrentCollectionStaffNickname,
  getCurrentUsername,
} from "@/pages/collection/utils";
import {
  MAX_COLLECTION_DAILY_YEAR,
  MIN_COLLECTION_DAILY_YEAR,
  useCollectionDailyPeriod,
  getCollectionDailyTodayDate,
} from "@/pages/collection/useCollectionDailyPeriod";
import { useCollectionDailyData } from "@/pages/collection/useCollectionDailyData";
import { useCollectionDailyUserSelection } from "@/pages/collection/useCollectionDailyUserSelection";
import { useCollectionDailyUsersData } from "@/pages/collection/useCollectionDailyUsersData";
import { createCollectionDailyDialogFocus } from "@/pages/collection/collection-daily-dialog-focus";
import { getCollectionDailyAdjacentDates } from "@/pages/collection/collection-daily-date-navigation";
import { CollectionDailyDateNavigation } from "@/pages/collection/CollectionDailyDateNavigation";
import { useCollectionDailyClock } from "@/pages/collection/useCollectionDailyClock";

type UseCollectionDailyPageModelOptions = {
  role: string;
};

type CollectionDailyDayRecord = CollectionDailyDayDetailsResponse["records"][number];

export function useCollectionDailyPageModel({ role }: UseCollectionDailyPageModelOptions) {
  const now = useCollectionDailyClock();
  const [discardChangesOpen, setDiscardChangesOpen] = useState(false);
  const dialogFocus = useMemo(() => createCollectionDailyDialogFocus(), []);
  const canViewAllStaff =
    role === "admin" || role === "manager" || role === "superuser";
  const canMutateTargets = role === "admin" || role === "superuser";
  const currentUsername = useMemo(
    () => getCurrentCollectionStaffNickname() || getCurrentUsername(),
    [],
  );

  const {
    year,
    month,
    yearInput,
    monthInput,
    setYearInput,
    setMonthInput,
    commitYearInput,
    commitMonthInput,
    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,
    canPreviousMonth,
    canNextMonth,
    isCurrentMonth,
  } = useCollectionDailyPeriod(now);

  const usersData = useCollectionDailyUsersData({ canManage: canViewAllStaff });

  const userSelection = useCollectionDailyUserSelection({
    canManage: canViewAllStaff,
    currentUsername,
    users: usersData.users,
  });
  const canEditTarget = canMutateTargets && userSelection.canEditTarget;
  const canEditCalendar = role === "superuser" && userSelection.canEditTarget;

  const data = useCollectionDailyData({
    canManage: canViewAllStaff,
    currentUsername,
    year,
    month,
    selectedUsernames: userSelection.selectedUsernames,
    selectedQueryUsers: userSelection.selectedQueryUsers,
    canEditTarget,
    canEditCalendar,
  });

  const periodNavigationDisabled = data.loadingOverview || data.savingCalendar || data.savingTarget || data.dirtyCalendarDaysCount > 0;
  const periodNavigationDisabledReason = data.dirtyCalendarDaysCount > 0
    ? "Simpan perubahan kalendar sebelum menukar bulan. Untuk membatalkannya, klik Refresh dan sahkan."
    : data.savingCalendar || data.savingTarget ? "Tunggu sehingga simpanan selesai sebelum menukar bulan." : undefined;
  const handleYearCommit = useCallback(() => periodNavigationDisabled ? year : commitYearInput(), [commitYearInput, periodNavigationDisabled, year]);
  const handleMonthCommit = useCallback(() => periodNavigationDisabled ? month : commitMonthInput(), [commitMonthInput, month, periodNavigationDisabled]);
  const handlePreviousMonth = useCallback(() => { if (!periodNavigationDisabled) goToPreviousMonth(); }, [goToPreviousMonth, periodNavigationDisabled]);
  const handleNextMonth = useCallback(() => { if (!periodNavigationDisabled) goToNextMonth(); }, [goToNextMonth, periodNavigationDisabled]);
  const handleCurrentMonth = useCallback(() => { if (!periodNavigationDisabled) goToCurrentMonth(new Date()); }, [goToCurrentMonth, periodNavigationDisabled]);

  const handleRefresh = useCallback(() => {
    if (data.loadingOverview || data.savingCalendar || data.savingTarget) return;
    if (data.dirtyCalendarDaysCount > 0) {
      setDiscardChangesOpen(true);
      return;
    }
    const nextYear = commitYearInput();
    const nextMonth = commitMonthInput();
    if (nextYear === year && nextMonth === month) void data.refreshCurrentView();
  }, [commitMonthInput, commitYearInput, data, month, year]);

  const handleDiscardChanges = useCallback(() => {
    setDiscardChangesOpen(false);
    if (!data.loadingOverview && !data.savingCalendar && !data.savingTarget) void data.refreshCurrentView();
  }, [data]);

  const handleDaySelect = useCallback((date: string, trigger?: HTMLElement) => {
    dialogFocus.remember("day", trigger, date);
    void data.loadDayDetails(date, 1);
  }, [data, dialogFocus]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) data.closeDayDetails();
  }, [data]);

  const handleViewReceipt = useCallback((record: CollectionDailyDayRecord, receiptId?: string, trigger?: HTMLElement) => {
    dialogFocus.remember("receipt", trigger);
    data.viewReceipt(record, receiptId);
  }, [data, dialogFocus]);

  const handleDayCloseAutoFocus = useCallback((event: Event) => {
    dialogFocus.restore("day", event);
  }, [dialogFocus]);

  const handleReceiptCloseAutoFocus = useCallback((event: Event) => {
    dialogFocus.restore("receipt", event);
  }, [dialogFocus]);

  const handleDialogPageChange = useCallback((page: number) => {
    if (data.selectedDate && !data.loadingDayDetails) {
      void data.loadDayDetails(data.selectedDate, page);
    }
  }, [data]);

  const adjacentDates = getCollectionDailyAdjacentDates(data.overview?.days ?? [], data.selectedDate);
  const handleDialogDateChange = useCallback((date: string) => {
    if (data.loadingDayDetails || (date !== adjacentDates.previousDate && date !== adjacentDates.nextDate)) return;
    // Preserve the original calendar launcher; date changes stay inside this dialog.
    void data.loadDayDetails(date, 1);
  }, [adjacentDates.nextDate, adjacentDates.previousDate, data]);

  const handleSaveTarget = useCallback(() => {
    void data.saveMonthlyTarget();
  }, [data]);

  const handleSaveCalendar = useCallback(() => {
    void data.saveCalendar();
  }, [data]);

  return {
    canManage: canViewAllStaff,
    currentUsername,
    overview: data.overview,
    discardChangesDialogProps: {
      open: discardChangesOpen,
      onOpenChange: setDiscardChangesOpen,
      onConfirm: handleDiscardChanges,
    },
    roleGuideProps: {
      role,
      selectedUsersLabel: userSelection.selectedUsersLabel,
      canManage: canViewAllStaff,
      canEditCalendar,
    },
    filtersCardProps: {
      canManage: canViewAllStaff,
      currentUsername,
      yearInput,
      monthInput,
      minYear: MIN_COLLECTION_DAILY_YEAR,
      maxYear: MAX_COLLECTION_DAILY_YEAR,
      onYearInputChange: setYearInput,
      onMonthInputChange: setMonthInput,
      onYearCommit: handleYearCommit,
      onMonthCommit: handleMonthCommit,
      onPreviousMonth: handlePreviousMonth,
      onNextMonth: handleNextMonth,
      onCurrentMonth: handleCurrentMonth,
      canPreviousMonth,
      canNextMonth,
      isCurrentMonth,
      periodNavigationDisabled,
      periodNavigationDisabledReason,
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
      canEditTarget,
      savingTarget: data.savingTarget,
      onSaveTarget: handleSaveTarget,
      savingCalendar: data.savingCalendar,
      onSaveCalendar: handleSaveCalendar,
      calendarDays: data.calendarDays,
      dirtyCalendarDaysCount: data.dirtyCalendarDaysCount,
      canEditCalendar,
    },
    calendarCardProps: {
      loadingOverview: data.loadingOverview,
      overview: data.overview,
      emptyOverviewMessage: data.emptyOverviewMessage,
      firstWeekday: data.firstWeekday,
      selectedDate: data.selectedDate,
      todayDate: getCollectionDailyTodayDate(now),
      canManage: canEditCalendar,
      editableCalendarByDay: data.editableCalendarByDay,
      dirtyCalendarDayNumbers: data.dirtyCalendarDayNumbers,
      savingCalendar: data.savingCalendar,
      onSaveCalendar: handleSaveCalendar,
      onSelectDate: handleDaySelect,
      onUpdateEditableDay: data.updateEditableDay,
      onUpdateEditableDays: data.updateEditableDays,
    },
    dayDetailsDialogProps: {
      open: Boolean(data.selectedDate),
      selectedDate: data.selectedDate,
      loadingDayDetails: data.loadingDayDetails,
      dayDetailsError: data.dayDetailsError,
      onRetry: data.retryDayDetails,
      dateNavigation: createElement(CollectionDailyDateNavigation, {
        ...adjacentDates,
        loading: data.loadingDayDetails,
        onChangeDate: handleDialogDateChange,
      }),
      dayDetails: data.dayDetails,
      selectedOverviewDay: data.selectedOverviewDay,
      loadingReceiptKey: data.loadingReceiptKey,
      onOpenChange: handleDialogOpenChange,
      onViewReceipt: handleViewReceipt,
      onChangePage: handleDialogPageChange,
      onCloseAutoFocus: handleDayCloseAutoFocus,
    },
    receiptPreviewDialogProps: {
      ...data.receiptPreviewDialogProps,
      onCloseAutoFocus: handleReceiptCloseAutoFocus,
    },
  };
}
