import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { formatAmountRM } from "@/pages/collection/utils";
import { MonthlyComparisonHint } from "./MonthlyComparisonHint";
import {
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonPercentage,
  type CollectionMonthlyComparisonBenchmarkId,
  type CollectionMonthlyComparisonBenchmarkSummary,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonBenchmarkPanelProps = {
  benchmarks: CollectionMonthlyComparisonBenchmarkSummary[];
};

export function CollectionMonthlyComparisonBenchmarkPanel({
  benchmarks,
}: CollectionMonthlyComparisonBenchmarkPanelProps) {
  const [activeBenchmarkId, setActiveBenchmarkId] =
    useState<CollectionMonthlyComparisonBenchmarkId>("previous-month");
  const activeBenchmark = useMemo(
    () => benchmarks.find((benchmark) => benchmark.id === activeBenchmarkId)
      || benchmarks.find((benchmark) => benchmark.available)
      || benchmarks[0]
      || null,
    [activeBenchmarkId, benchmarks],
  );

  if (!activeBenchmark) {
    return null;
  }

  return (
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
          <p className="text-2xs text-muted-foreground">Reference</p>
          <p className="text-sm font-semibold text-foreground">
            {activeBenchmark.referenceTotal === null
              ? "Unavailable"
              : formatAmountRM(activeBenchmark.referenceTotal)}
          </p>
          <p className="truncate text-2xs text-muted-foreground">{activeBenchmark.referenceLabel}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-2xs text-muted-foreground">Difference</p>
          <p className="text-sm font-semibold text-foreground">
            {formatCollectionMonthlyComparisonDifference(activeBenchmark.difference)}
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-2xs text-muted-foreground">Formula</p>
          <p className="text-xs leading-5 text-foreground">{activeBenchmark.formula}</p>
        </div>
      </div>
    </div>
  );
}
