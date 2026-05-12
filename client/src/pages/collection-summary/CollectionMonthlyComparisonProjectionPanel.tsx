import { Activity } from "lucide-react";
import { formatAmountRM } from "@/pages/collection/utils";
import { MonthlyComparisonHint } from "./MonthlyComparisonHint";
import {
  formatCollectionMonthlyComparisonDifference,
  type CollectionMonthlyComparisonProjection,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonProjectionPanelProps = {
  projection: CollectionMonthlyComparisonProjection | null;
};

export function CollectionMonthlyComparisonProjectionPanel({
  projection,
}: CollectionMonthlyComparisonProjectionPanelProps) {
  if (!projection) {
    return null;
  }

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.035] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
              Current month projection
            </p>
            <MonthlyComparisonHint
              label="Current month projection explanation"
              text="Projection uses current month collection divided by elapsed days, multiplied by total days in the month. It appears only when the current month is in the selected range."
            />
          </div>
          <p className="mt-1 text-sm leading-6 text-foreground">
            {projection.label} is projected at{" "}
            <span className="font-semibold">{formatAmountRM(projection.projectedTotal)}</span>
            {projection.targetGap !== null ? (
              <>
                {" "}with target gap{" "}
                <span className={projection.targetGap >= 0 ? "font-semibold text-emerald-700 dark:text-emerald-300" : "font-semibold text-destructive"}>
                  {formatCollectionMonthlyComparisonDifference(projection.targetGap)}
                </span>
                .
              </>
            ) : "."}
          </p>
        </div>
        <span
          className={
            projection.status === "on_track"
              ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
              : projection.status === "behind"
                ? "rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
          }
        >
          {projection.status === "on_track"
            ? "On track"
            : projection.status === "behind" ? "Behind target" : "No target"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border/50 bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Current total</p>
          <p className="text-sm font-semibold text-foreground">{formatAmountRM(projection.currentTotal)}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Daily pace</p>
          <p className="text-sm font-semibold text-foreground">{formatAmountRM(projection.dailyAverage)}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Remaining days</p>
          <p className="text-sm font-semibold text-foreground">{projection.remainingDays}</p>
        </div>
      </div>
    </div>
  );
}
