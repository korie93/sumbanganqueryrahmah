import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CircleHelp, Download } from "lucide-react";
import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  CollectionMonthlyComparisonResponse,
} from "@/lib/api";
import { CollectionNicknameSingleSelect } from "@/pages/collection-report/CollectionNicknameSingleSelect";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  buildCollectionMonthlyComparisonAccessibleSummary,
  buildCollectionMonthlyComparisonInsights,
  buildCollectionMonthlyComparisonPresetRanges,
  buildCollectionMonthlyComparisonTargetSummary,
  buildCollectionMonthlyComparisonTrendExplanation,
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonMonthDelta,
  formatCollectionMonthlyComparisonPercentage,
  resolveCollectionMonthlyComparisonTone,
  type CollectionMonthlyComparisonPresetRange,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonPanelProps = {
  canFilterByNickname: boolean;
  availableNicknames: string[];
  selectedNickname: string;
  startMonth: string;
  endMonth: string;
  loading: boolean;
  errorMessage: string | null;
  data: CollectionMonthlyComparisonResponse | null;
  hasAvailableNickname: boolean;
  showHeader?: boolean | undefined;
  standalone?: boolean | undefined;
  onSelectedNicknameChange: (value: string) => void;
  onStartMonthChange: (value: string) => void;
  onEndMonthChange: (value: string) => void;
  onApply: () => void;
  onRangePresetApply: (preset: CollectionMonthlyComparisonPresetRange) => void;
  onReset: () => void;
  monthlyTargetAmount?: number | null | undefined;
  monthlyTargetLoading?: boolean | undefined;
  monthlyTargetErrorMessage?: string | null | undefined;
  monthlyTargetSourceLabel?: string | null | undefined;
  onExportCsv?: (() => void) | undefined;
  onMonthSelect?: ((monthKey: string) => void) | undefined;
  chartSlot?: ReactNode | undefined;
};

function MonthlyComparisonHint({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={label}
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="max-w-[min(20rem,calc(100vw-2rem))] text-xs leading-5">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function CollectionMonthlyComparisonPanel({
  canFilterByNickname,
  availableNicknames,
  selectedNickname,
  startMonth,
  endMonth,
  loading,
  errorMessage,
  data,
  hasAvailableNickname,
  showHeader = true,
  standalone = false,
  onSelectedNicknameChange,
  onStartMonthChange,
  onEndMonthChange,
  onApply,
  onRangePresetApply,
  onReset,
  monthlyTargetAmount = null,
  monthlyTargetLoading = false,
  monthlyTargetErrorMessage = null,
  monthlyTargetSourceLabel = null,
  onExportCsv,
  onMonthSelect,
  chartSlot,
}: CollectionMonthlyComparisonPanelProps) {
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);
  const comparison = data?.comparison || null;
  const comparisonTone = comparison
    ? resolveCollectionMonthlyComparisonTone(comparison.direction)
    : "default";
  const comparisonSummary = data
    ? buildCollectionMonthlyComparisonAccessibleSummary(data)
    : null;
  const trendExplanation = data
    ? buildCollectionMonthlyComparisonTrendExplanation(data)
    : null;
  const insights = useMemo(
    () => (data ? buildCollectionMonthlyComparisonInsights(data) : null),
    [data],
  );
  const targetSummary = useMemo(
    () => (data ? buildCollectionMonthlyComparisonTargetSummary(data, monthlyTargetAmount) : null),
    [data, monthlyTargetAmount],
  );
  const [nicknameSelectOpen, setNicknameSelectOpen] = useState(false);
  const baseMonthRecordCount = comparison?.baseMonth
    ? data?.months.find((entry) => entry.month === comparison.baseMonth)?.recordCount || 0
    : 0;
  const targetMonthRecordCount = comparison
    ? data?.months.find((entry) => entry.month === comparison.targetMonth)?.recordCount || 0
    : 0;
  const selectedNicknameLabel = useMemo(() => {
    const normalizedValue = String(selectedNickname || "").trim();
    if (!normalizedValue) {
      return loading ? "Loading visible nicknames..." : "Choose a staff nickname";
    }
    return normalizedValue;
  }, [loading, selectedNickname]);
  const rangePresets = useMemo(
    () => buildCollectionMonthlyComparisonPresetRanges(),
    [],
  );
  const latestMonthInsight = insights?.monthInsights[insights.monthInsights.length - 1] || null;
  const targetDisplayLabel = monthlyTargetLoading
    ? "Loading target..."
    : monthlyTargetAmount && monthlyTargetAmount > 0
      ? formatAmountRM(monthlyTargetAmount)
      : "No target configured";
  const targetSupportingLabel = monthlyTargetSourceLabel
    ? `Configured for ${monthlyTargetSourceLabel}`
    : "Uses the configured target for the target month";
  const breakdownToggleButtonClassName =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-input bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <section
      aria-labelledby="collection-monthly-comparison-title"
      className={standalone ? "space-y-4" : "space-y-4 border-t border-border/60 pt-4"}
      data-floating-ai-avoid="true"
    >
      {showHeader ? (
        <div className="space-y-1">
          <h2 id="collection-monthly-comparison-title" className="text-lg font-semibold text-foreground">
            Monthly Collection Comparison
          </h2>
          <p className="text-sm text-muted-foreground">
            Compare month-by-month collection totals for a single staff nickname across a bounded reporting range.
          </p>
        </div>
      ) : (
        <h2 id="collection-monthly-comparison-title" className="sr-only">
          Monthly Collection Comparison
        </h2>
      )}

      <div className="rounded-2xl border border-border/60 bg-background p-3 shadow-sm">
        <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(11rem,11rem)_minmax(11rem,11rem)_auto_auto] xl:items-end">
          <div className="space-y-1">
            {canFilterByNickname ? (
              <CollectionNicknameSingleSelect
                label="Staff nickname"
                triggerId="collection-monthly-comparison-nickname"
                open={nicknameSelectOpen}
                loading={loading && !selectedNickname}
                selectedLabel={selectedNicknameLabel}
                options={availableNicknames}
                value={selectedNickname}
                onOpenChange={setNicknameSelectOpen}
                onSelect={onSelectedNicknameChange}
                triggerClassName="h-11 rounded-2xl bg-background"
                popoverClassName="w-[min(360px,calc(100vw-2rem))] rounded-2xl border-border/70 bg-popover p-2 shadow-xl"
              />
            ) : (
              <div className="space-y-1">
                <label
                  htmlFor="collection-monthly-comparison-nickname"
                  className="text-sm font-medium text-foreground"
                >
                  Staff nickname
                </label>
                <input
                  id="collection-monthly-comparison-nickname"
                  value={selectedNickname}
                  readOnly
                  className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground"
                  aria-readonly="true"
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="collection-monthly-comparison-start-month"
              className="text-sm font-medium text-foreground"
            >
              Start month
            </label>
            <input
              id="collection-monthly-comparison-start-month"
              type="month"
              value={startMonth}
              onChange={(event) => onStartMonthChange(event.target.value)}
              className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="collection-monthly-comparison-end-month"
              className="text-sm font-medium text-foreground"
            >
              End month
            </label>
            <input
              id="collection-monthly-comparison-end-month"
              type="month"
              value={endMonth}
              onChange={(event) => onEndMonthChange(event.target.value)}
              className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm"
            />
          </div>

          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            onClick={onApply}
            disabled={loading || !hasAvailableNickname}
          >
            Apply
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
            onClick={onReset}
            disabled={loading}
          >
            Reset
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-foreground/68 dark:text-foreground/74">
          <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
            Single nickname only
          </span>
          <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
            First month = base
          </span>
          <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
            Last month = target
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Quick range</span>
          {rangePresets.map((preset) => {
            const active = preset.startMonth === startMonth && preset.endMonth === endMonth;
            return (
              <button
                key={preset.id}
                type="button"
                className={
                  active
                    ? "inline-flex h-8 items-center justify-center rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-primary"
                    : "inline-flex h-8 items-center justify-center rounded-full border border-border/70 bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
                }
                onClick={() => onRangePresetApply(preset)}
                disabled={loading || !hasAvailableNickname}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(14rem,18rem)_auto] md:items-end md:justify-between">
          <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Monthly target
              </p>
              <MonthlyComparisonHint
                label="Monthly target explanation"
                text="This value is read from the superuser-configured daily target for the currently applied target month and staff nickname. No manual fallback is used."
              />
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {targetDisplayLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              {targetSupportingLabel}
            </p>
            {monthlyTargetErrorMessage ? (
              <p role="status" className="mt-1 text-xs text-destructive">
                Target unavailable: {monthlyTargetErrorMessage}
              </p>
            ) : null}
          </div>
          {onExportCsv ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onExportCsv}
              disabled={loading || monthlyTargetLoading || !data}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </button>
          ) : null}
        </div>
      </div>

      {!hasAvailableNickname ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-background px-4 py-4 text-sm text-muted-foreground">
          No visible staff nickname is available for this monthly comparison yet.
        </p>
      ) : null}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-border/60 bg-background px-4 py-5 text-sm text-muted-foreground"
        >
          Loading monthly comparison...
        </div>
      ) : null}

      {!loading && errorMessage ? (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}

      {!loading && !errorMessage && data ? (
        <div className="space-y-4">
          <OperationalSummaryStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <OperationalMetric
              label={comparison?.baseLabel ? `${comparison.baseLabel} Total` : "Base month total"}
              value={
                !comparison || comparison.baseTotal === null
                  ? "No previous month"
                  : formatAmountRM(comparison.baseTotal)
              }
              supporting={
                comparison?.baseLabel
                  ? `${baseMonthRecordCount} record(s)`
                  : "Select at least two months to compare"
              }
            />
            <OperationalMetric
              label={`${comparison?.targetLabel || "Target month"} Total`}
              value={formatAmountRM(comparison?.targetTotal || 0)}
              supporting={`${targetMonthRecordCount} record(s)`}
            />
            <OperationalMetric
              label="Difference"
              value={formatCollectionMonthlyComparisonDifference(comparison?.difference ?? null)}
              tone={comparisonTone}
              supporting={comparison?.direction === "no_previous_data" ? "No previous month to compare" : undefined}
            />
            <OperationalMetric
              label="Percentage Change"
              value={formatCollectionMonthlyComparisonPercentage(comparison?.percentageChange ?? null)}
              tone={comparisonTone}
            />
          </OperationalSummaryStrip>

          {insights ? (
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
              </div>
            </div>
          ) : null}
          {comparisonSummary ? <p className="sr-only">{comparisonSummary}</p> : null}

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
                    className={breakdownToggleButtonClassName}
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
                    className={breakdownToggleButtonClassName}
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
                    <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                      Months
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {insights.activeMonthCount}/{data.months.length} active
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                      Latest
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">
                      {latestMonthInsight ? formatAmountRM(latestMonthInsight.totalCollection) : "No data"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
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
                {insights && breakdownExpanded ? insights.monthInsights.map((month) => (
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
                          {targetSummary ? (
                            <span
                              className={
                                month.totalCollection >= targetSummary.monthlyTargetAmount
                                  ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                                  : "rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
                              }
                            >
                              {month.totalCollection >= targetSummary.monthlyTargetAmount
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
                        {targetSummary ? (
                          <span>
                            Target gap {formatCollectionMonthlyComparisonDifference(
                              month.totalCollection - targetSummary.monthlyTargetAmount,
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
                )) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
