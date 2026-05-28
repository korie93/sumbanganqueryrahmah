import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

import {
  formatCollectionSameDayPaceMonthLabel,
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonTargetLookup,
} from "./collection-monthly-comparison-utils";

type CollectionComparisonTargetCardsProps = {
  comparison: CollectionMonthlyComparisonResponse["comparison"] | null | undefined;
  monthlyTargetAmount: number | null | undefined;
  monthlyTargetsByMonth: CollectionMonthlyComparisonTargetLookup | undefined;
};

function buildCollectionMonthlyComparisonTargetCards({
  comparison,
  monthlyTargetAmount,
  monthlyTargetsByMonth,
}: CollectionComparisonTargetCardsProps) {
  if (!comparison) {
    return [];
  }

  const months = [
    {
      month: comparison.baseMonth,
      role: "Start month target",
      label: comparison.baseMonth
        ? comparison.baseLabel || formatCollectionSameDayPaceMonthLabel(comparison.baseMonth)
        : "Start month",
    },
    {
      month: comparison.targetMonth,
      role: "End month target",
      label: comparison.targetLabel || formatCollectionSameDayPaceMonthLabel(comparison.targetMonth),
    },
  ].flatMap((entry) => (entry.month ? [{ ...entry, month: entry.month }] : []))
    .filter((entry, index, entries) => (
      entries.findIndex((candidate) => candidate.month === entry.month) === index
    ));

  return months.map((entry) => {
    const target = resolveCollectionMonthlyComparisonTargetForMonth(
      entry.month,
      monthlyTargetsByMonth ?? monthlyTargetAmount,
    );
    return {
      ...entry,
      target,
      displayValue: target === null ? "No target configured" : formatAmountRM(target),
    };
  });
}

export function CollectionComparisonTargetCards({
  comparison,
  monthlyTargetAmount,
  monthlyTargetsByMonth,
}: CollectionComparisonTargetCardsProps) {
  const cards = buildCollectionMonthlyComparisonTargetCards({
    comparison,
    monthlyTargetAmount,
    monthlyTargetsByMonth,
  });

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 grid gap-2">
      {cards.map((entry) => (
        <div
          key={entry.month}
          className="rounded-xl border border-border/50 bg-background px-2.5 py-2"
        >
          <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
            {entry.label} Target
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">{entry.displayValue}</span>
            <span
              className={
                entry.target === null
                  ? "rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-300"
                  : "rounded-full bg-emerald-500/10 px-2 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300"
              }
            >
              {entry.role}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
