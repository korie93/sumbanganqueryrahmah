import { CollectionDailyPeriodFields } from "@/pages/collection/CollectionDailyPeriodFields";
import { CollectionDailyStaffScopeField } from "@/pages/collection/CollectionDailyStaffScopeField";
import { CollectionDailyTargetControlsSection } from "@/pages/collection/CollectionDailyTargetControlsSection";
import type { CollectionDailyFiltersCardProps } from "@/pages/collection/collection-daily-filters-card-shared";

export function CollectionDailyDesktopFiltersLayout(
  props: CollectionDailyFiltersCardProps,
) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <CollectionDailyPeriodFields
          {...props}
          isMobile={false}
          containerClassName="contents"
        />
        <CollectionDailyStaffScopeField {...props} isMobile={false} />
      </div>

      {props.canManage ? (
        <CollectionDailyTargetControlsSection {...props} isMobile={false} />
      ) : null}
    </>
  );
}
