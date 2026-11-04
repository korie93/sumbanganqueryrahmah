import { useCallback, useRef, useState } from "react";
import { setCollectionDailyCalendar, setCollectionDailyTarget } from "@/lib/api";
import { parseCollectionAmountMyrInput } from "@shared/collection-amount-types";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyCalendarSavedDescription } from "@/pages/collection/collection-daily-calendar-save-feedback";
import { buildCollectionDailyCalendarPayloadDays } from "@/pages/collection/collection-daily-state-utils";
import { createCollectionDailyMutationGuard } from "@/pages/collection/collection-daily-mutation-guard";
import {
  emitCollectionTargetChanged,
  parseApiError,
} from "@/pages/collection/utils";

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
  hasCalendarDraft: () => boolean;
  isOverviewLoading: () => boolean;
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
  hasCalendarDraft,
  isOverviewLoading,
  onRefresh,
  onCalendarSaved,
  toast,
}: UseCollectionDailyMutationStateOptions) {
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const guard = useRef(createCollectionDailyMutationGuard()).current;
  const scopeKey = JSON.stringify([year, month, selectedUsernames]);
  const currentScopeRef = useRef(scopeKey);
  currentScopeRef.current = scopeKey;

  const saveMonthlyTarget = useCallback(async () => {
    if (guard.isBusy() || isOverviewLoading()) return;
    if (hasCalendarDraft()) {
      toast({
        title: "Unsaved Calendar Changes",
        description: "Save Changed Days first, or use Refresh and confirm discarding the calendar changes before saving the target.",
      });
      return;
    }
    const selectedUsername = selectedUsernames[0];
    if (!canManage || !canEditTarget || selectedUsernames.length !== 1 || !selectedUsername) {
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

    const release = guard.tryStart("target", hasCalendarDraft());
    if (!release) return;
    setSavingTarget(true);
    try {
      await setCollectionDailyTarget({
        username: selectedUsername,
        year,
        month,
        monthlyTarget,
      });
      emitCollectionTargetChanged();
      toast({
        title: "Target Saved",
        description: "Monthly target has been updated.",
      });
      if (currentScopeRef.current === scopeKey) await onRefresh();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Target",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      release();
      setSavingTarget(false);
    }
  }, [
    canEditTarget,
    canManage,
    guard,
    hasCalendarDraft,
    isOverviewLoading,
    month,
    monthlyTargetInput,
    onRefresh,
    selectedUsernames,
    scopeKey,
    toast,
    year,
  ]);

  const saveCalendar = useCallback(async () => {
    if (guard.isBusy() || isOverviewLoading()) return;
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

    const release = guard.tryStart("calendar", hasCalendarDraft());
    if (!release) return;
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
        description: buildCollectionDailyCalendarSavedDescription({
          username: selectedUsername,
          year,
          month,
          days: calendarDaysToSave,
        }),
      });
      if (currentScopeRef.current === scopeKey) {
        onCalendarSaved();
        await onRefresh();
      }
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Calendar",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      release();
      setSavingCalendar(false);
    }
  }, [
    calendarDaysToSave,
    canEditCalendar,
    canManage,
    guard,
    hasCalendarDraft,
    isOverviewLoading,
    month,
    onCalendarSaved,
    onRefresh,
    selectedUsernames,
    scopeKey,
    toast,
    year,
  ]);

  return {
    isSaving: guard.isBusy,
    savingTarget,
    savingCalendar,
    saveMonthlyTarget,
    saveCalendar,
  };
}
