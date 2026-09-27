import { Suspense, lazy } from "react";
import type { CollectionDailyTargetControlsSectionProps } from "@/pages/collection/collection-daily-filters-card-shared";

const CollectionDailyTargetControls = lazy(() =>
  import("@/pages/collection/CollectionDailyTargetControls").then((module) => ({
    default: module.CollectionDailyTargetControls,
  })),
);

export function CollectionDailyTargetControlsSection({
  monthlyTargetInput,
  onMonthlyTargetInputChange,
  canEditTarget,
  canEditCalendar,
  savingTarget,
  onSaveTarget,
  savingCalendar,
  onSaveCalendar,
  calendarDays,
  dirtyCalendarDaysCount,
  isMobile,
}: CollectionDailyTargetControlsSectionProps) {
  const fallback = (
    <div
      role="status"
      aria-label="Loading target controls"
      className={`gap-3 border-t border-border pt-4 ${
        isMobile
          ? "space-y-3"
          : "grid md:grid-cols-[220px_auto] md:items-end"
      }`}
    >
      <div className="space-y-1">
        <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div
          className={`animate-pulse rounded-md bg-muted motion-reduce:animate-none ${
            isMobile ? "h-11" : "h-9"
          }`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div
          className={`w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none ${
            isMobile ? "h-11" : "h-9"
          }`}
        />
        <div
          className={`w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none ${
            isMobile ? "h-11" : "h-9"
          }`}
        />
      </div>
    </div>
  );

  return (
    <Suspense fallback={fallback}>
      <CollectionDailyTargetControls
        monthlyTargetInput={monthlyTargetInput}
        onMonthlyTargetInputChange={onMonthlyTargetInputChange}
        canEditTarget={canEditTarget}
        canEditCalendar={canEditCalendar}
        savingTarget={savingTarget}
        onSaveTarget={onSaveTarget}
        savingCalendar={savingCalendar}
        onSaveCalendar={onSaveCalendar}
        calendarDays={calendarDays}
        dirtyCalendarDaysCount={dirtyCalendarDaysCount}
      />
    </Suspense>
  );
}
