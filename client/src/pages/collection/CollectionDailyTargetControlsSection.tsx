import { Suspense } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import type { CollectionDailyTargetControlsSectionProps } from "@/pages/collection/collection-daily-filters-card-shared";

const CollectionDailyTargetControls = lazyWithPreload(() =>
  import("@/pages/collection/CollectionDailyManagerControls").then((module) => ({
    default: module.CollectionDailyTargetControls,
  })),
);

export function CollectionDailyTargetControlsSection({
  monthlyTargetInput,
  onMonthlyTargetInputChange,
  canEditTarget,
  savingTarget,
  onSaveTarget,
  savingCalendar,
  onSaveCalendar,
  calendarDays,
  isMobile,
}: CollectionDailyTargetControlsSectionProps) {
  const fallback = (
    <div
      className={`gap-3 border border-border/70 bg-background/70 p-4 ${
        isMobile
          ? "space-y-3 rounded-2xl"
          : "grid rounded-xl md:grid-cols-[220px_auto] md:items-end"
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
        savingTarget={savingTarget}
        onSaveTarget={onSaveTarget}
        savingCalendar={savingCalendar}
        onSaveCalendar={onSaveCalendar}
        calendarDays={calendarDays}
      />
    </Suspense>
  );
}
