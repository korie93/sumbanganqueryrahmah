import { CollectionDailyPeriodFields } from "@/pages/collection/CollectionDailyPeriodFields";
import { CollectionDailyStaffScopeField } from "@/pages/collection/CollectionDailyStaffScopeField";
import { CollectionDailyTargetControlsSection } from "@/pages/collection/CollectionDailyTargetControlsSection";
import type { CollectionDailyFiltersCardProps } from "@/pages/collection/collection-daily-filters-card-shared";

export function CollectionDailyDesktopFiltersLayout(
  props: CollectionDailyFiltersCardProps,
) {
  return (
    <>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section aria-label="Reporting Period">
          <CollectionDailyPeriodFields
            {...props}
            isMobile={false}
            containerClassName="grid gap-3 md:grid-cols-2"
          />
        </section>

        <section aria-label="Staff Scope">
          <CollectionDailyStaffScopeField {...props} isMobile={false} />
        </section>
      </div>

      {props.canManage ? (
        <CollectionDailyTargetControlsSection {...props} isMobile={false} />
      ) : null}
    </>
  );
}
