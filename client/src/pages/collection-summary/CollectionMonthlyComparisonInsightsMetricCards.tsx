import { formatAmountRM } from "@/pages/collection/utils";
import { MonthlyComparisonHint } from "./MonthlyComparisonHint";
import {
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonMonthDelta,
  type CollectionMonthlyComparisonInsights,
  type CollectionMonthlyComparisonTargetSummary,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonInsightsMetricCardsProps = {
  insights: CollectionMonthlyComparisonInsights;
  targetSummary: CollectionMonthlyComparisonTargetSummary | null;
};

export function CollectionMonthlyComparisonInsightsMetricCards({
  insights,
  targetSummary,
}: CollectionMonthlyComparisonInsightsMetricCardsProps) {
  return (
    <>
      <div className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
          Range total
          <span className="ml-1 inline-flex align-middle">
            <MonthlyComparisonHint
              label="Range total explanation"
              text="Sum of all monthly collection totals returned for the applied date range."
            />
          </span>
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {formatAmountRM(insights.rangeTotal)}
        </p>
        <p className="text-xs text-muted-foreground">
          {insights.totalRecords} record(s), avg {formatAmountRM(insights.averagePerRecord)}
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
          Best month
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {insights.peakMonth?.label || "No data"}
        </p>
        <p className="text-xs text-muted-foreground">
          {insights.peakMonth ? formatAmountRM(insights.peakMonth.totalCollection) : "No collection recorded"}
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
          Weakest active
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {insights.lowestActiveMonth?.label || "No active month"}
        </p>
        <p className="text-xs text-muted-foreground">
          {insights.lowestActiveMonth ? formatAmountRM(insights.lowestActiveMonth.totalCollection) : "No collection recorded"}
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
          Biggest jump
          <span className="ml-1 inline-flex align-middle">
            <MonthlyComparisonHint
              label="Biggest jump explanation"
              text="Largest positive month-to-month difference in the selected range."
            />
          </span>
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {insights.strongestIncreaseMonth?.label || "No jump"}
        </p>
        <p className="text-xs text-muted-foreground">
          {insights.strongestIncreaseMonth
            ? formatCollectionMonthlyComparisonMonthDelta(
              insights.strongestIncreaseMonth.deltaFromPrevious,
              insights.strongestIncreaseMonth.percentageFromPrevious,
            )
            : "No month increased"}
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
          Biggest drop
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {insights.strongestDecreaseMonth?.label || "No drop"}
        </p>
        <p className="text-xs text-muted-foreground">
          {insights.strongestDecreaseMonth
            ? formatCollectionMonthlyComparisonMonthDelta(
              insights.strongestDecreaseMonth.deltaFromPrevious,
              insights.strongestDecreaseMonth.percentageFromPrevious,
            )
            : "No month decreased"}
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
          Audit watch
          <span className="ml-1 inline-flex align-middle">
            <MonthlyComparisonHint
              label="Audit watch explanation"
              text="Flags any month where the percentage change versus the previous month is greater than 30%."
            />
          </span>
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {insights.anomalyMonthCount > 0
            ? `${insights.anomalyMonthCount} month(s)`
            : "No anomaly"}
        </p>
        <p className="text-xs text-muted-foreground">
          {insights.anomalyMonths[0]?.anomalyLabel || "No month moved more than 30%"}
        </p>
      </div>
      {targetSummary ? (
        <div className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
            Target gap
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {formatCollectionMonthlyComparisonDifference(targetSummary.targetGap)}
          </p>
          <p className="text-xs text-muted-foreground">
            {(targetSummary.targetProgress * 100).toFixed(1)}% of {formatAmountRM(targetSummary.rangeTarget)}
          </p>
        </div>
      ) : null}
    </>
  );
}
