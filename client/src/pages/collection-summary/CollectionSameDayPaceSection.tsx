import { Activity } from "lucide-react";

import { formatAmountRM } from "@/pages/collection/utils";
import { MonthlyComparisonHint } from "./MonthlyComparisonHint";
import { SameDayCompareDayControls } from "./SameDayCompareDayControls";
import {
  formatCollectionMonthlyComparisonDifference,
  type CollectionSameDayPaceComparison,
  type CollectionSameDayPaceComparisonMode,
  type CollectionSameDayPaceDayRange,
} from "./collection-monthly-comparison-utils";

type CollectionSameDayPaceSectionProps = {
  comparisonMode: CollectionSameDayPaceComparisonMode;
  errorMessage?: string | null | undefined;
  loading?: boolean | undefined;
  maxDay?: number | null | undefined;
  onComparisonModeChange?: ((mode: CollectionSameDayPaceComparisonMode) => void) | undefined;
  onDayRangeChange?: ((range: CollectionSameDayPaceDayRange) => void) | undefined;
  pace?: CollectionSameDayPaceComparison | null | undefined;
  selectedDayRange?: CollectionSameDayPaceDayRange | null | undefined;
  unavailableReason?: string | null | undefined;
};

function getSameDayPaceToneClassName(pace: CollectionSameDayPaceComparison | null | undefined) {
  if (pace?.direction === "faster") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (pace?.direction === "slower") {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

export function CollectionSameDayPaceSection({
  comparisonMode,
  errorMessage = null,
  loading = false,
  maxDay = null,
  onComparisonModeChange,
  onDayRangeChange,
  pace = null,
  selectedDayRange = null,
  unavailableReason = null,
}: CollectionSameDayPaceSectionProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="rounded-2xl border border-border/60 bg-background px-4 py-4 text-sm text-muted-foreground shadow-sm"
      >
        Loading same-day pace comparison...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <p
        role="alert"
        className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
      >
        Same-day pace unavailable: {errorMessage}
      </p>
    );
  }

  if (!pace) {
    return unavailableReason ? (
      <p className="rounded-2xl border border-dashed border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">
        {unavailableReason}
      </p>
    ) : null;
  }

  const progressMax = Math.max(
    pace.currentTotal,
    pace.previousTotal,
    pace.target?.expectedByToday || 0,
    1,
  );

  return (
    <div className="collection-monthly-comparison-section-card collection-monthly-comparison-section-card--pace rounded-2xl border border-border/60 bg-background px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Same-day collection pace</p>
            <MonthlyComparisonHint
              label="Same-day comparison methodology"
              text="Compares the selected end month against the selected start month for the same calendar day range. Cumulative values start from the selected start day."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {pace.currentRangeLabel} vs {pace.previousRangeLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getSameDayPaceToneClassName(pace)}`}>
            {pace.headline}
          </span>
        </div>
      </div>

      {selectedDayRange && maxDay && onDayRangeChange && onComparisonModeChange ? (
        <div className="mt-4">
          <SameDayCompareDayControls
            pace={pace}
            dayRange={selectedDayRange}
            maxDay={maxDay}
            comparisonMode={comparisonMode}
            onDayRangeChange={onDayRangeChange}
            onComparisonModeChange={onComparisonModeChange}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-foreground">{pace.summary}</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                Current
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatAmountRM(pace.currentTotal)}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                Previous
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatAmountRM(pace.previousTotal)}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                Gap
              </p>
              <p className={pace.difference < 0 ? "mt-1 text-sm font-semibold text-destructive" : "mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300"}>
                {formatCollectionMonthlyComparisonDifference(pace.difference)}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                  Avg / day
                </p>
                <MonthlyComparisonHint
                  label="Same-day daily average formula"
                  text="Current selected-range total divided by the number of compared calendar days."
                />
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatAmountRM(pace.currentDailyAverage)}
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-3">
            <div className="space-y-1">
              <div className="flex justify-between gap-3 text-xs">
                <span className="font-medium text-foreground">{pace.currentLabel}</span>
                <span className="text-muted-foreground">{formatAmountRM(pace.currentTotal)}</span>
              </div>
              <progress
                className="collection-monthly-comparison-progress collection-monthly-comparison-progress--current"
                max={progressMax}
                value={Math.max(0, pace.currentTotal)}
                aria-label={`${pace.currentLabel} same-day total`}
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between gap-3 text-xs">
                <span className="font-medium text-foreground">{pace.previousLabel}</span>
                <span className="text-muted-foreground">{formatAmountRM(pace.previousTotal)}</span>
              </div>
              <progress
                className="collection-monthly-comparison-progress collection-monthly-comparison-progress--previous"
                max={progressMax}
                value={Math.max(0, pace.previousTotal)}
                aria-label={`${pace.previousLabel} same-day total`}
              />
            </div>
            {pace.target ? (
              <div className="space-y-1">
                <div className="flex justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground">Expected range target pace</span>
                  <span className="text-muted-foreground">{formatAmountRM(pace.target.expectedByToday)}</span>
                </div>
                <progress
                  className="collection-monthly-comparison-progress collection-monthly-comparison-progress--target"
                  max={progressMax}
                  value={Math.max(0, pace.target.expectedByToday)}
                  aria-label="Expected same-day target pace"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-3">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                Smart insights
              </p>
              <MonthlyComparisonHint
                label="Same-day insight explanation"
                text="Insights combine same-day totals, daily average, target pace, momentum, and daily consistency."
              />
            </div>
            <div className="mt-2 grid gap-2">
              {pace.insights.slice(0, 5).map((insight) => (
                <p key={insight} className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs leading-5 text-foreground">
                  {insight}
                </p>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                Momentum
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">{pace.momentum.label}</p>
              <p className="text-xs text-muted-foreground">{pace.momentum.description}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                Target pace
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {pace.target ? pace.target.label : "No target configured"}
              </p>
              <p className="text-xs text-muted-foreground">
                {pace.target
                  ? `${formatCollectionMonthlyComparisonDifference(pace.target.paceGap)} vs expected range pace`
                  : "Superuser target is needed for target pacing."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
