import { Badge } from "@/components/ui/badge";
import { CollectionDailyPeriodFields } from "@/pages/collection/CollectionDailyPeriodFields";
import { CollectionDailyStaffScopeField } from "@/pages/collection/CollectionDailyStaffScopeField";
import { CollectionDailyTargetControlsSection } from "@/pages/collection/CollectionDailyTargetControlsSection";
import type { CollectionDailyFiltersCardProps } from "@/pages/collection/collection-daily-filters-card-shared";
import {
  getCollectionDailyScopeLabel,
  getCollectionDailyStaffScopeDescription,
} from "@/pages/collection/collection-daily-filters-card-utils";

export function CollectionDailyMobileFiltersLayout(props: CollectionDailyFiltersCardProps) {
  const scopeLabel = getCollectionDailyScopeLabel({
    canManage: props.canManage,
    currentUsername: props.currentUsername,
    selectedUsersLabel: props.selectedUsersLabel,
  });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
              Year {props.yearInput || "-"}
            </Badge>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
              Month {props.monthInput || "-"}
            </Badge>
            <Badge variant="outline" className="max-w-full rounded-full px-3 py-1 text-[11px]">
              <span className="truncate">{scopeLabel}</span>
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Adjust period and staff scope first, then save target or calendar only when changes are ready.
          </p>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-3.5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">Reporting Period</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Change month or year to refresh the daily collection view.
          </p>
        </div>
        <CollectionDailyPeriodFields {...props} isMobile />
      </section>

      <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-3.5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">Staff Scope</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {getCollectionDailyStaffScopeDescription(props.canManage)}
          </p>
        </div>
        <CollectionDailyStaffScopeField {...props} isMobile />
      </section>

      {props.canManage ? (
        <CollectionDailyTargetControlsSection {...props} isMobile />
      ) : null}
    </div>
  );
}
