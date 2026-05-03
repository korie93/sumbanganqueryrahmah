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
        <section className="space-y-3 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Reporting Period</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Set the working month first so the rest of the calendar stays in sync.
            </p>
          </div>
          <CollectionDailyPeriodFields
            {...props}
            isMobile={false}
            containerClassName="grid gap-3 md:grid-cols-2"
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Staff Scope</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Focus the daily view on one or more staff without leaving the calendar workspace.
            </p>
          </div>
          <CollectionDailyStaffScopeField {...props} isMobile={false} />
        </section>
      </div>

      {props.canManage ? (
        <CollectionDailyTargetControlsSection {...props} isMobile={false} />
      ) : null}
    </>
  );
}
