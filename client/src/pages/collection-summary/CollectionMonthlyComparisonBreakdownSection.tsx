import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { formatAmountRM } from "@/pages/collection/utils";
import { CollectionMonthlyComparisonBreakdownList } from "./CollectionMonthlyComparisonBreakdownList";
import { MonthlyComparisonHint } from "./MonthlyComparisonHint";
import type {
  CollectionMonthlyComparisonInsights,
  CollectionMonthlyComparisonTargetLookup,
  CollectionMonthlyComparisonTargetSummary,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonBreakdownSectionProps = {
  chartSlot?: ReactNode | undefined;
  insights: CollectionMonthlyComparisonInsights | null;
  monthCount: number;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  onMonthSelect?: ((monthKey: string) => void) | undefined;
  targetSummary: CollectionMonthlyComparisonTargetSummary | null;
};

const BREAKDOWN_TOGGLE_BUTTON_CLASS_NAME =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-input bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CollectionMonthlyComparisonBreakdownSection({
  chartSlot,
  insights,
  monthCount,
  monthlyTargetsByMonth,
  onMonthSelect,
  targetSummary,
}: CollectionMonthlyComparisonBreakdownSectionProps) {
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);
  const latestMonthInsight = insights?.monthInsights[insights.monthInsights.length - 1] || null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)] xl:items-start">
      {chartSlot ? (
        <div className="space-y-3">
          {chartSlot}
        </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-border/60 bg-background p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">Monthly breakdown</h3>
              <MonthlyComparisonHint
                label="Monthly breakdown explanation"
                text="Collapsed by default to keep the dashboard compact. Expand to inspect each month, record count, average, share of range, target gap, and anomaly flags."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {latestMonthInsight
                ? `${latestMonthInsight.label}: ${formatAmountRM(latestMonthInsight.totalCollection)} across ${latestMonthInsight.recordCount} record(s).`
                : "Empty months stay visible as RM0 for quick trend review."}
            </p>
          </div>
          {breakdownExpanded ? (
            <button
              type="button"
              className={BREAKDOWN_TOGGLE_BUTTON_CLASS_NAME}
              onClick={() => setBreakdownExpanded(false)}
              aria-expanded="true"
              aria-controls="collection-monthly-comparison-breakdown"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              Collapse
            </button>
          ) : (
            <button
              type="button"
              className={BREAKDOWN_TOGGLE_BUTTON_CLASS_NAME}
              onClick={() => setBreakdownExpanded(true)}
              aria-expanded="false"
              aria-controls="collection-monthly-comparison-breakdown"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              Expand
            </button>
          )}
        </div>

        {insights ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
                Months
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {insights.activeMonthCount}/{monthCount} active
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
                Latest
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {latestMonthInsight ? formatAmountRM(latestMonthInsight.totalCollection) : "No data"}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
                Audit
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {insights.anomalyMonthCount > 0 ? `${insights.anomalyMonthCount} flagged` : "Clear"}
              </p>
            </div>
          </div>
        ) : null}

        <div
          id="collection-monthly-comparison-breakdown"
          className={
            breakdownExpanded
              ? "grid gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
              : "hidden"
          }
        >
          {insights && breakdownExpanded ? (
            <CollectionMonthlyComparisonBreakdownList
              insights={insights}
              targetSummary={targetSummary}
              monthlyTargetsByMonth={monthlyTargetsByMonth}
              onMonthSelect={onMonthSelect}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
