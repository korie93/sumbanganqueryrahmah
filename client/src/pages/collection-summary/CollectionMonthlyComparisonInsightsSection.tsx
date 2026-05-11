import { useMemo, useState } from "react";
import { Activity, BarChart3, ShieldCheck } from "lucide-react";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";
import { MonthlyComparisonHint } from "./MonthlyComparisonHint";
import {
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonMonthDelta,
  formatCollectionMonthlyComparisonPercentage,
  type CollectionMonthlyComparisonBenchmarkId,
  type CollectionMonthlyComparisonBenchmarkSummary,
  type CollectionMonthlyComparisonDataQualitySummary,
  type CollectionMonthlyComparisonInsights,
  type CollectionMonthlyComparisonProjection,
  type CollectionMonthlyComparisonTargetSummary,
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
  const [activeBenchmarkId, setActiveBenchmarkId] =
    useState<CollectionMonthlyComparisonBenchmarkId>("previous-month");
  const activeBenchmark = useMemo(
    () => benchmarks.find((benchmark) => benchmark.id === activeBenchmarkId)
      || benchmarks.find((benchmark) => benchmark.available)
      || benchmarks[0]
      || null,
    [activeBenchmarkId, benchmarks],
  );

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
                {activeBenchmark ? (
                  <div className="mt-3 rounded-xl border border-border/60 bg-background px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                            Benchmark lens
                          </p>
                          <MonthlyComparisonHint
                            label="Benchmark lens explanation"
                            text="Switch how the target month is compared: previous month, same month last year, previous 3-month average, or earlier selected-range average."
                          />
                        </div>
                        <p className="mt-1 text-sm leading-6 text-foreground">
                          {activeBenchmark.summary}
                        </p>
                      </div>
                      <span
                        className={
                          activeBenchmark.direction === "increase"
                            ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                            : activeBenchmark.direction === "decrease"
                              ? "rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                              : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {formatCollectionMonthlyComparisonPercentage(activeBenchmark.percentageChange)}
                      </span>
                    </div>
                    <div
                      className="mt-3 flex flex-wrap gap-2"
                      role="group"
                      aria-label="Monthly comparison benchmark mode"
                    >
                      {benchmarks.map((benchmark) => {
                        const active = benchmark.id === activeBenchmark.id;
                        const benchmarkButtonClassName = active
                          ? "inline-flex h-8 items-center justify-center rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-primary"
                          : "inline-flex h-8 items-center justify-center rounded-full border border-border/70 bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground";
                        if (active) {
                          return (
                            <button
                              key={benchmark.id}
                              type="button"
                              className={benchmarkButtonClassName}
                              onClick={() => setActiveBenchmarkId(benchmark.id)}
                              aria-pressed="true"
                              title={benchmark.available ? benchmark.formula : benchmark.summary}
                            >
                              {benchmark.shortLabel}
                            </button>
                          );
                        }

                        return (
                          <button
                            key={benchmark.id}
                            type="button"
                            className={benchmarkButtonClassName}
                            onClick={() => setActiveBenchmarkId(benchmark.id)}
                            aria-pressed="false"
                            title={benchmark.available ? benchmark.formula : benchmark.summary}
                          >
                            {benchmark.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Reference</p>
                        <p className="text-sm font-semibold text-foreground">
                          {activeBenchmark.referenceTotal === null
                            ? "Unavailable"
                            : formatAmountRM(activeBenchmark.referenceTotal)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">{activeBenchmark.referenceLabel}</p>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Difference</p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatCollectionMonthlyComparisonDifference(activeBenchmark.difference)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Formula</p>
                        <p className="text-xs leading-5 text-foreground">{activeBenchmark.formula}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
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
                {projection ? (
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
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
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
                {dataQualitySummary ? (
                  <div className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm sm:col-span-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                            Data quality
                          </p>
                          <MonthlyComparisonHint
                            label="Data quality explanation"
                            text="Checks target availability, anomaly months, empty months, unusually low record volume, and current-month projection risk."
                          />
                        </div>
                        <p className="mt-1 text-lg font-semibold text-foreground">
                          {dataQualitySummary.statusLabel}
                        </p>
                      </div>
                      <span
                        className={
                          dataQualitySummary.statusTone === "success"
                            ? "shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                            : dataQualitySummary.statusTone === "danger"
                              ? "shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                              : "shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
                        }
                      >
                        {dataQualitySummary.warningCount} review
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {dataQualitySummary.signals.slice(0, 4).map((signal) => (
                        <div
                          key={signal.id}
                          className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2"
                        >
                          <p className="text-xs font-medium text-foreground">{signal.label}</p>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{signal.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
  );
}