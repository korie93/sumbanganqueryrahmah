import { Suspense } from "react";
import type { ActivityFilters } from "@/lib/api";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { ActivitySectionFallback } from "@/pages/activity/ActivityDeferredSection";
import type { ActivityStatus } from "@/pages/activity/types";

const ActivityFiltersPanel = lazyWithPreload(() =>
  import("@/pages/activity/ActivityFiltersPanel").then((module) => ({
    default: module.ActivityFiltersPanel,
  })),
);

type ActivityFiltersSectionProps = {
  dateFromOpen: boolean;
  dateToOpen: boolean;
  filters: ActivityFilters;
  onApply: () => void;
  onClear: () => void;
  onDateFromOpenChange: (open: boolean) => void;
  onDateToOpenChange: (open: boolean) => void;
  onFieldChange: (field: keyof ActivityFilters, value: string) => void;
  onToggleStatus: (status: ActivityStatus) => void;
  showFilters: boolean;
};

export function ActivityFiltersSection({
  dateFromOpen,
  dateToOpen,
  filters,
  onApply,
  onClear,
  onDateFromOpenChange,
  onDateToOpenChange,
  onFieldChange,
  onToggleStatus,
  showFilters,
}: ActivityFiltersSectionProps) {
  if (!showFilters) {
    return null;
  }

  return (
    <Suspense fallback={<ActivitySectionFallback label="Loading activity filters..." />}>
      <ActivityFiltersPanel
        dateFromOpen={dateFromOpen}
        dateToOpen={dateToOpen}
        filters={filters}
        onApply={onApply}
        onClear={onClear}
        onDateFromOpenChange={onDateFromOpenChange}
        onDateToOpenChange={onDateToOpenChange}
        onFieldChange={onFieldChange}
        onToggleStatus={onToggleStatus}
      />
    </Suspense>
  );
}
