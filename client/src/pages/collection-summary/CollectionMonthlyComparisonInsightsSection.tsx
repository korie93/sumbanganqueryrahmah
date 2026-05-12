import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { CollectionMonthlyComparisonBenchmarkPanel } from "./CollectionMonthlyComparisonBenchmarkPanel";
import { CollectionMonthlyComparisonDataQualityCard } from "./CollectionMonthlyComparisonDataQualityCard";
import { CollectionMonthlyComparisonInsightsMetricCards } from "./CollectionMonthlyComparisonInsightsMetricCards";
import { CollectionMonthlyComparisonProjectionPanel } from "./CollectionMonthlyComparisonProjectionPanel";
import { MonthlyComparisonHint } from "./MonthlyComparisonHint";
import type {
  CollectionMonthlyComparisonBenchmarkSummary,
  CollectionMonthlyComparisonDataQualitySummary,
  CollectionMonthlyComparisonInsights,
  CollectionMonthlyComparisonProjection,
  CollectionMonthlyComparisonTargetSummary,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonInsightsSectionProps = {
  benchmarks: CollectionMonthlyComparisonBenchmarkSummary[];
  comparison: CollectionMonthlyComparisonResponse["comparison"] | null;
  dataQualitySummary: CollectionMonthlyComparisonDataQualitySummary | null;
  insights: CollectionMonthlyComparisonInsights;
  projection: CollectionMonthlyComparisonProjection | null;
  targetSummary: CollectionMonthlyComparisonTargetSummary | null;
  trendExplanation: string | null;
};

export function CollectionMonthlyComparisonInsightsSection({
  benchmarks,
  comparison,
  dataQualitySummary,
  insights,
  projection,
  targetSummary,
  trendExplanation,
}: CollectionMonthlyComparisonInsightsSectionProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
      <div className="rounded-2xl border border-border/60 bg-background px-4 py-4 shadow-sm">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">Comparison summary</p>
          <MonthlyComparisonHint
            label="Comparison summary formula"
            text="The headline compares the target month total against the immediately preceding/base month in the selected range."
          />
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{comparison?.summary}</p>
        {trendExplanation ? (
          <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
              Trend explanation
            </p>
            <p className="mt-1 text-sm leading-6 text-foreground">
              {trendExplanation}
            </p>
          </div>
        ) : null}
        <CollectionMonthlyComparisonBenchmarkPanel benchmarks={benchmarks} />
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-foreground/68 dark:text-foreground/74">
          <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
            {insights.positiveMonthCount} month(s) up
          </span>
          <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
            {insights.negativeMonthCount} month(s) down
          </span>
          <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
            {insights.emptyMonthCount} empty month(s)
          </span>
          {insights.anomalyMonthCount > 0 ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-300">
              {insights.anomalyMonthCount} anomaly month(s)
            </span>
          ) : null}
          {targetSummary ? (
            <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
              {targetSummary.monthsAtOrAboveTarget} month(s) at target
            </span>
          ) : null}
        </div>
        <CollectionMonthlyComparisonProjectionPanel projection={projection} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <CollectionMonthlyComparisonInsightsMetricCards
          insights={insights}
          targetSummary={targetSummary}
        />
        <CollectionMonthlyComparisonDataQualityCard dataQualitySummary={dataQualitySummary} />
      </div>
    </div>
  );
}
