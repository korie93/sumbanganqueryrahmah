import { CollectionDailyPeriodFields } from "@/pages/collection/CollectionDailyPeriodFields";
import { CollectionDailyStaffScopeField } from "@/pages/collection/CollectionDailyStaffScopeField";
import { CollectionDailyTargetControlsSection } from "@/pages/collection/CollectionDailyTargetControlsSection";
import type { CollectionDailyFiltersCardProps } from "@/pages/collection/collection-daily-filters-card-shared";

export function CollectionDailyMobileFiltersLayout(props: CollectionDailyFiltersCardProps) {
  return (
    <div className="space-y-3">
      <section aria-label="Reporting Period">
        <CollectionDailyPeriodFields {...props} isMobile containerClassName="grid grid-cols-2 gap-3" />
      </section>

      <section aria-label="Staff Scope">
        <CollectionDailyStaffScopeField {...props} isMobile />
      </section>

      {props.canManage ? (
        <CollectionDailyTargetControlsSection {...props} isMobile />
      ) : null}
    </div>
  );
}
