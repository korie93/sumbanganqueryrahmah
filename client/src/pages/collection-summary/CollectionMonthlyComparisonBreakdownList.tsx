import { memo } from "react";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonMonthDelta,
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonInsights,
  type CollectionMonthlyComparisonTargetSummary,
  type CollectionMonthlyComparisonTargetLookup,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonBreakdownListProps = {
  insights: CollectionMonthlyComparisonInsights;
  targetSummary: CollectionMonthlyComparisonTargetSummary | null;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  onMonthSelect?: ((monthKey: string) => void) | undefined;
};

function CollectionMonthlyComparisonBreakdownList({
  insights,
  targetSummary,
  monthlyTargetsByMonth,
  onMonthSelect,
}: CollectionMonthlyComparisonBreakdownListProps) {
  return (
    <>
      {insights.monthInsights.map((month) => {
        const monthTarget = resolveCollectionMonthlyComparisonTargetForMonth(
          month.month,
          monthlyTargetsByMonth ?? targetSummary?.targetByMonth ?? targetSummary?.monthlyTargetAmount,
        );
        return (
          <button
            key={month.month}
            type="button"
            className="grid gap-3 rounded-2xl border border-border/50 bg-background px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:border-border/50 disabled:hover:bg-background"
            onClick={() => onMonthSelect?.(month.month)}
            disabled={!onMonthSelect}
            aria-label={`View collection records for ${month.label}`}
          >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-sm font-medium text-foreground">{month.label}</p>
                {month.isBaseMonth ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Base
                  </span>
                ) : null}
                {month.isTargetMonth ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    Target
                  </span>
                ) : null}
                {month.isPeakMonth ? (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    Peak
                  </span>
                ) : null}
                {month.isAnomaly ? (
                  <span
                    className={
                      month.anomalyDirection === "decrease"
                        ? "rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
                        : "rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                    }
                  >
                    {month.anomalyDirection === "decrease" ? "Anomaly drop" : "Anomaly jump"}
                  </span>
                ) : null}
                {monthTarget !== null ? (
                  <span
                    className={
                      month.totalCollection >= monthTarget
                        ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                        : "rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
                    }
                  >
                    {month.totalCollection >= monthTarget
                      ? "Above target"
                      : "Below target"}
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-foreground">
                {formatAmountRM(month.totalCollection)}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  month.isAnomaly
                    ? month.anomalyDirection === "decrease"
                      ? "h-full rounded-full bg-destructive"
                      : "h-full rounded-full bg-amber-500"
                    : "h-full rounded-full bg-primary"
                }
                style={{
                  width: month.maxTotalRatio > 0
                    ? `${Math.max(5, Math.round(month.maxTotalRatio * 100))}%`
                    : "0%",
                }}
                aria-hidden="true"
              />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/64 dark:text-foreground/74">
              <span>{month.recordCount} record(s)</span>
              <span>Avg {formatAmountRM(month.averagePerRecord)}</span>
              <span>{(month.shareOfRangeTotal * 100).toFixed(1)}% of range</span>
              <span>
                {formatCollectionMonthlyComparisonMonthDelta(
                  month.deltaFromPrevious,
                  month.percentageFromPrevious,
                )}
              </span>
              <span>
                {month.recordCount === 0 ? "No collection recorded" : "Active month"}
              </span>
              {month.anomalyLabel ? (
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  {month.anomalyLabel}
                </span>
              ) : null}
              {monthTarget !== null ? (
                <span>
                  Target gap {formatCollectionMonthlyComparisonDifference(
                    month.totalCollection - monthTarget,
                  )}
                </span>
              ) : null}
            </div>
            {onMonthSelect ? (
              <p className="text-xs font-medium text-primary">
                View records
              </p>
            ) : null}
          </div>
          </button>
        );
      })}
    </>
  );
}

const MemoizedCollectionMonthlyComparisonBreakdownList = memo(CollectionMonthlyComparisonBreakdownList);
MemoizedCollectionMonthlyComparisonBreakdownList.displayName = "CollectionMonthlyComparisonBreakdownList";

export { MemoizedCollectionMonthlyComparisonBreakdownList as CollectionMonthlyComparisonBreakdownList };
