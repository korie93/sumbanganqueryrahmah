import { useCallback, useState } from "react";
import { setCollectionDailyCalendar, setCollectionDailyTarget } from "@/lib/api";
import { parseCollectionAmountMyrInput } from "@shared/collection-amount-types";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyCalendarPayloadDays } from "@/pages/collection/collection-daily-state-utils";
import { parseApiError } from "@/pages/collection/utils";

type ToastFn = (options: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseCollectionDailyMutationStateOptions = {
  canManage: boolean;
  canEditTarget: boolean;
  canEditCalendar: boolean;
  year: number;
  month: number;
  selectedUsernames: string[];
  monthlyTargetInput: string;
  calendarDaysToSave: EditableCalendarDay[];
  onRefresh: () => Promise<void>;
  onCalendarSaved: () => void;
  toast: ToastFn;
};

export function useCollectionDailyMutationState({
  canManage,
  canEditTarget,
  canEditCalendar,
  year,
  month,
  selectedUsernames,
  monthlyTargetInput,
  calendarDaysToSave,
  onRefresh,
  onCalendarSaved,
  toast,
}: UseCollectionDailyMutationStateOptions) {
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);

  const saveMonthlyTarget = useCallback(async () => {
    const selectedUsername = selectedUsernames[0];
    if (!canManage || !canEditTarget || !selectedUsername) {
      toast({
        title: "Select One Staff Nickname",
        description: "Please select exactly one staff nickname to update monthly target.",
        variant: "destructive",
      });
      return;
    }

    const monthlyTarget = parseCollectionAmountMyrInput(monthlyTargetInput, { allowZero: true });
    if (monthlyTarget === null || monthlyTarget < 0) {
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
        username: selectedUsername,
        year,
        month,
        monthlyTarget,
      });
      toast({
        title: "Target Saved",
        description: "Monthly target has been updated.",
      });
      await onRefresh();
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
    month,
    monthlyTargetInput,
    onRefresh,
    selectedUsernames,
    toast,
    year,
  ]);

  const saveCalendar = useCallback(async () => {
    const selectedUsername = selectedUsernames[0];
    if (!canManage || !canEditCalendar) {
      toast({
        title: "Superuser Required",
        description: "Only superuser can update daily Working or Holiday/Leave status.",
        variant: "destructive",
      });
      return;
    }
    if (selectedUsernames.length !== 1 || !selectedUsername) {
      toast({
        title: "Select One Staff Nickname",
        description: "Please select exactly one staff nickname before saving daily status.",
        variant: "destructive",
      });
      return;
    }

    if (!calendarDaysToSave.length) {
      toast({
        title: "No Calendar Changes",
        description: "Choose Edit status on a date, change the status, then save the changed day.",
      });
      return;
    }

    const missingLeaveTypeDay = calendarDaysToSave.find((day) =>
      day.status === "HOLIDAY" && !day.leaveType
    );
    if (missingLeaveTypeDay) {
      toast({
        title: "Leave Type Required",
        description: `Please choose a leave type for day ${missingLeaveTypeDay.day}.`,
        variant: "destructive",
      });
      return;
    }

    setSavingCalendar(true);
    try {
      await setCollectionDailyCalendar({
        username: selectedUsername,
        year,
        month,
        days: buildCollectionDailyCalendarPayloadDays(calendarDaysToSave),
      });
      toast({
        title: "Daily Status Saved",
        description:
          calendarDaysToSave.length === 1
            ? `Updated day ${calendarDaysToSave[0]?.day} for ${selectedUsername}.`
            : `Updated ${calendarDaysToSave.length} changed days for ${selectedUsername}.`,
      });
      onCalendarSaved();
      await onRefresh();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Calendar",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSavingCalendar(false);
    }
  }, [
    calendarDaysToSave,
    canEditCalendar,
    canManage,
    month,
    onCalendarSaved,
    onRefresh,
    selectedUsernames,
    toast,
    year,
  ]);

  return {
    savingTarget,
    savingCalendar,
    saveMonthlyTarget,
    saveCalendar,
  };
}
