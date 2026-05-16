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
      className={`gap-3 border border-border/70 bg-background p-4 shadow-sm ${
        isMobile
          ? "space-y-3 rounded-2xl"
          : "grid rounded-2xl md:grid-cols-[220px_auto] md:items-end"
      }`}
    >
      <div className="space-y-1">
        <div className="h-4 w-32 animate-pulse rounded bg-muted/30" />
        <div
          className={`animate-pulse border border-border/60 bg-muted/20 ${
            isMobile ? "h-12 rounded-2xl" : "h-10 rounded-md"
          }`}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div
          className={`h-10 w-full animate-pulse border border-border/60 bg-muted/20 ${
            isMobile ? "rounded-2xl" : "rounded-md"
          }`}
        />
        <div
          className={`h-10 w-full animate-pulse border border-border/60 bg-muted/20 ${
            isMobile ? "rounded-2xl" : "rounded-md"
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
