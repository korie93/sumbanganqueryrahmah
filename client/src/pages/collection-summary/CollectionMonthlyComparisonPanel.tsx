import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, ChevronDown, ChevronUp, CircleHelp, Download, Printer, ShieldCheck } from "lucide-react";
import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  CollectionMonthlyComparisonResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { CollectionNicknameSingleSelect } from "@/pages/collection-report/CollectionNicknameSingleSelect";
import { formatAmountRM } from "@/pages/collection/utils";
import { CollectionMonthlyComparisonBreakdownList } from "./CollectionMonthlyComparisonBreakdownList";
import {
  buildCollectionMonthlyComparisonAccessibleSummary,
  buildCollectionMonthlyComparisonBenchmarks,
  buildCollectionMonthlyComparisonDataQualitySummary,
  buildCollectionMonthlyComparisonInsights,
  buildCollectionMonthlyComparisonPresetRanges,
  buildCollectionMonthlyComparisonProjection,
  buildCollectionMonthlyComparisonTargetSummary,
  buildCollectionMonthlyComparisonTrendExplanation,
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonMonthDelta,
  formatCollectionMonthlyComparisonPercentage,
  formatCollectionSameDayPaceMonthLabel,
  normalizeCollectionMonthInputValue,
  resolveCollectionMonthlyComparisonTargetForMonth,
  resolveCollectionMonthlyComparisonTone,
  type CollectionMonthlyComparisonBenchmarkId,
  type CollectionMonthlyComparisonPresetRange,
  type CollectionMonthlyComparisonTargetLookup,
  type CollectionSameDayPaceComparison,
  type CollectionSameDayPaceDayRange,
} from "./collection-monthly-comparison-utils";
import "./CollectionMonthlyComparisonPanel.css";

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
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  monthlyTargetLoading?: boolean | undefined;
  monthlyTargetErrorMessage?: string | null | undefined;
  monthlyTargetSourceLabel?: string | null | undefined;
  sameDayPace?: CollectionSameDayPaceComparison | null | undefined;
  sameDayPaceLoading?: boolean | undefined;
  sameDayPaceErrorMessage?: string | null | undefined;
  sameDayPaceUnavailableReason?: string | null | undefined;
  sameDayPaceDayRange?: CollectionSameDayPaceDayRange | null | undefined;
  sameDayPaceMaxDay?: number | null | undefined;
  onExportCsv?: (() => void) | undefined;
  onPrintReport?: (() => void) | undefined;
  onMonthSelect?: ((monthKey: string) => void) | undefined;
  onSameDayPaceDayRangeChange?: ((range: CollectionSameDayPaceDayRange) => void) | undefined;
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

function CollectionMonthField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const helpId = `${id}-format`;
  const normalizedDraftValue = normalizeCollectionMonthInputValue(draftValue);
  const showInvalidState = draftValue.trim().length > 0 && !normalizedDraftValue;
  const invalidAriaAttributes = showInvalidState ? { "aria-invalid": "true" as const } : {};

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const commitDraftValue = (nextValue: string) => {
    const normalized = normalizeCollectionMonthInputValue(nextValue);
    if (normalized) {
      setDraftValue(normalized);
      onChange(normalized);
      return true;
    }
    return false;
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]{4}-[0-9]{1,2}"
        placeholder="YYYY-MM"
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);
          commitDraftValue(nextValue);
        }}
        onBlur={() => {
          if (!commitDraftValue(draftValue)) {
            setDraftValue(value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            if (!commitDraftValue(draftValue)) {
              setDraftValue(value);
            }
          }
        }}
        aria-describedby={helpId}
        {...invalidAriaAttributes}
        title="Use YYYY-MM format, for example 2026-05"
        className={cn(
          "collection-monthly-comparison-control h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm",
          showInvalidState && "border-destructive text-destructive focus-visible:ring-destructive",
        )}
      />
      <span
        id={helpId}
        className={showInvalidState ? "text-[11px] font-medium text-destructive" : "sr-only"}
      >
        Use YYYY-MM format, for example 2026-05.
      </span>
    </div>
  );
}

function buildCollectionMonthlyComparisonTargetCards(input: {
  comparison: CollectionMonthlyComparisonResponse["comparison"] | null | undefined;
  monthlyTargetAmount: number | null | undefined;
  monthlyTargetsByMonth: CollectionMonthlyComparisonTargetLookup | undefined;
}) {
  const { comparison, monthlyTargetAmount, monthlyTargetsByMonth } = input;
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
  monthlyTargetsByMonth,
  monthlyTargetLoading = false,
  monthlyTargetErrorMessage = null,
  monthlyTargetSourceLabel = null,
  sameDayPace = null,
  sameDayPaceLoading = false,
  sameDayPaceErrorMessage = null,
  sameDayPaceUnavailableReason = null,
  sameDayPaceDayRange = null,
  sameDayPaceMaxDay = null,
  onExportCsv,
  onPrintReport,
  onMonthSelect,
  onSameDayPaceDayRangeChange,
  chartSlot,
}: CollectionMonthlyComparisonPanelProps) {
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);
  const [activeBenchmarkId, setActiveBenchmarkId] =
    useState<CollectionMonthlyComparisonBenchmarkId>("previous-month");
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
    () => (data ? buildCollectionMonthlyComparisonTargetSummary(data, monthlyTargetsByMonth ?? monthlyTargetAmount) : null),
    [data, monthlyTargetAmount, monthlyTargetsByMonth],
  );
  const projection = useMemo(
    () => (data ? buildCollectionMonthlyComparisonProjection(data, monthlyTargetsByMonth ?? monthlyTargetAmount) : null),
    [data, monthlyTargetAmount, monthlyTargetsByMonth],
  );
  const dataQualitySummary = useMemo(
    () => (data ? buildCollectionMonthlyComparisonDataQualitySummary(data, monthlyTargetsByMonth ?? monthlyTargetAmount) : null),
    [data, monthlyTargetAmount, monthlyTargetsByMonth],
  );
  const benchmarks = useMemo(
    () => (data ? buildCollectionMonthlyComparisonBenchmarks(data) : []),
    [data],
  );
  const activeBenchmark = useMemo(
    () => benchmarks.find((benchmark) => benchmark.id === activeBenchmarkId)
      || benchmarks.find((benchmark) => benchmark.available)
      || benchmarks[0]
      || null,
    [activeBenchmarkId, benchmarks],
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
  const sameDayPaceMax = sameDayPace
    ? Math.max(
      sameDayPace.currentTotal,
      sameDayPace.previousTotal,
      sameDayPace.target?.expectedByToday || 0,
      1,
    )
    : 1;
  const sameDayToneClassName = sameDayPace?.direction === "faster"
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : sameDayPace?.direction === "slower"
      ? "bg-destructive/10 text-destructive"
      : "bg-muted text-muted-foreground";
  const targetDisplayLabel = monthlyTargetLoading
    ? "Loading target..."
    : monthlyTargetAmount && monthlyTargetAmount > 0
      ? formatAmountRM(monthlyTargetAmount)
      : "No target configured";
  const targetConfidenceLabel = monthlyTargetLoading
    ? "Checking target"
    : monthlyTargetAmount && monthlyTargetAmount > 0
      ? "Superuser target active"
      : "Target missing";
  const targetSupportingLabel = monthlyTargetSourceLabel
    ? `Configured for ${monthlyTargetSourceLabel}`
    : targetSummary
      ? `${targetSummary.configuredMonthCount}/${data?.months.length || 0} selected month target(s) configured`
      : "Uses the configured target for the target month";
  const targetMonthSpecificNote = data?.comparison.targetMonth
    ? resolveCollectionMonthlyComparisonTargetForMonth(
      data.comparison.targetMonth,
      monthlyTargetsByMonth ?? monthlyTargetAmount,
    )
    : null;
  const comparisonTargetCards = useMemo(() => {
    return buildCollectionMonthlyComparisonTargetCards({
      comparison: data?.comparison,
      monthlyTargetAmount,
      monthlyTargetsByMonth,
    });
  }, [data?.comparison, monthlyTargetAmount, monthlyTargetsByMonth]);
  const handleSameDayStartDayChange = useCallback((value: number) => {
    if (!sameDayPaceDayRange || !sameDayPaceMaxDay || !onSameDayPaceDayRangeChange) {
      return;
    }
    const nextStart = Math.max(1, Math.min(sameDayPaceDayRange.endDay, Math.trunc(value || 1)));
    onSameDayPaceDayRangeChange({
      startDay: nextStart,
      endDay: sameDayPaceDayRange.endDay,
    });
  }, [onSameDayPaceDayRangeChange, sameDayPaceDayRange, sameDayPaceMaxDay]);
  const handleSameDayEndDayChange = useCallback((value: number) => {
    if (!sameDayPaceDayRange || !sameDayPaceMaxDay || !onSameDayPaceDayRangeChange) {
      return;
    }
    const nextEnd = Math.max(sameDayPaceDayRange.startDay, Math.min(sameDayPaceMaxDay, Math.trunc(value || sameDayPaceMaxDay)));
    onSameDayPaceDayRangeChange({
      startDay: sameDayPaceDayRange.startDay,
      endDay: nextEnd,
    });
  }, [onSameDayPaceDayRangeChange, sameDayPaceDayRange, sameDayPaceMaxDay]);
  const breakdownToggleButtonClassName =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-input bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <section
      aria-labelledby="collection-monthly-comparison-title"
      className={cn(
        "collection-monthly-comparison-panel space-y-4",
        !standalone && "border-t border-border/60 pt-4",
      )}
      data-floating-ai-avoid="true"
    >
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 id="collection-monthly-comparison-title" className="text-lg font-semibold text-foreground">
              Monthly Collection Comparison
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Compare monthly totals, same-day pacing, target progress, and audit movement for one staff nickname.
            </p>
          </div>
          <span className="collection-monthly-comparison-chip rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Same-day pacing ready
          </span>
        </div>
      ) : (
        <h2 id="collection-monthly-comparison-title" className="sr-only">
          Monthly Collection Comparison
        </h2>
      )}

      <div className="collection-monthly-comparison-filter-card rounded-2xl border border-border/60 bg-background p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              Comparison setup
            </p>
            <p className="mt-1 text-sm text-foreground">
              {startMonth} to {endMonth}
              {selectedNickname ? ` • ${selectedNickname}` : ""}
            </p>
          </div>
          <span className="collection-monthly-comparison-chip rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {data ? `${data.months.length} month(s) loaded` : "Ready to apply"}
          </span>
        </div>
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
                triggerClassName="collection-monthly-comparison-control h-11 rounded-2xl bg-background"
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
                  className="collection-monthly-comparison-control h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground"
                  aria-readonly="true"
                />
              </div>
            )}
          </div>

          <CollectionMonthField
            id="collection-monthly-comparison-start-month"
            label="Start month"
            value={startMonth}
            onChange={onStartMonthChange}
          />

          <CollectionMonthField
            id="collection-monthly-comparison-end-month"
            label="End month"
            value={endMonth}
            onChange={onEndMonthChange}
          />

          <button
            type="button"
            className="collection-monthly-comparison-primary-action inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onApply}
            disabled={loading || !hasAvailableNickname}
          >
            Apply
          </button>
          <button
            type="button"
            className="collection-monthly-comparison-secondary-action inline-flex h-11 items-center justify-center rounded-2xl border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
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
            <span
              className={
                monthlyTargetAmount && monthlyTargetAmount > 0
                  ? "mt-1 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                  : "mt-1 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
              }
            >
              {targetConfidenceLabel}
            </span>
            <p className="text-xs text-muted-foreground">
              {targetSupportingLabel}
            </p>
            {targetSummary ? (
              <p className="text-xs text-muted-foreground">
                {targetSummary.configuredMonthCount}/{data?.months.length || 0} selected month target(s) loaded
                {targetSummary.missingMonthCount > 0 ? `, ${targetSummary.missingMonthCount} missing` : ""}
                {targetMonthSpecificNote ? "" : ", target month missing"}
              </p>
            ) : null}
            {comparisonTargetCards.length > 0 ? (
              <div className="mt-2 grid gap-2">
                {comparisonTargetCards.map((entry) => (
                  <div
                    key={entry.month}
                    className="rounded-xl border border-border/50 bg-background px-2.5 py-2"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                      {entry.label} Target
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{entry.displayValue}</span>
                      <span
                        className={
                          entry.target === null
                            ? "rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                            : "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                        }
                      >
                        {entry.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {monthlyTargetErrorMessage ? (
              <p role="status" className="mt-1 text-xs text-destructive">
                Target unavailable: {monthlyTargetErrorMessage}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
            {onPrintReport ? (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                onClick={onPrintReport}
                disabled={loading || monthlyTargetLoading || !data}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print report
              </button>
            ) : null}
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
          className="collection-monthly-comparison-state-card rounded-2xl border border-border/60 bg-background px-4 py-5 text-sm text-muted-foreground"
        >
          <div className="flex flex-col gap-2">
            <span>Loading monthly comparison...</span>
            <span className="collection-monthly-comparison-skeleton h-2 w-full max-w-md rounded-full" aria-hidden="true" />
            <span className="collection-monthly-comparison-skeleton h-2 w-2/3 max-w-sm rounded-full" aria-hidden="true" />
          </div>
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

          {sameDayPaceLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-border/60 bg-background px-4 py-4 text-sm text-muted-foreground shadow-sm"
            >
              Loading same-day pace comparison...
            </div>
          ) : null}

          {!sameDayPaceLoading && sameDayPaceErrorMessage ? (
            <p
              role="alert"
              className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
            >
              Same-day pace unavailable: {sameDayPaceErrorMessage}
            </p>
          ) : null}

          {!sameDayPaceLoading && !sameDayPaceErrorMessage && sameDayPace ? (
            <div className="rounded-2xl border border-border/60 bg-background px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground">Same-day collection pace</p>
                    <MonthlyComparisonHint
                      label="Same-day comparison methodology"
                      text="Compares the selected end month against the selected start month for the same calendar day range. Cumulative values start from the selected start day."
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {sameDayPace.currentRangeLabel} vs {sameDayPace.previousRangeLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {sameDayPaceDayRange && sameDayPaceMaxDay && onSameDayPaceDayRangeChange ? (
                    <fieldset
                      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-muted/20 px-2.5 py-2"
                      aria-label="Same-day comparison day range"
                    >
                      <legend className="sr-only">Same-day comparison day range</legend>
                      <span className="text-[11px] font-medium text-muted-foreground">Compare days</span>
                      <label className="inline-flex items-center gap-1 text-xs text-foreground">
                        <span>From</span>
                        <input
                          type="number"
                          min={1}
                          max={sameDayPaceDayRange.endDay}
                          value={sameDayPaceDayRange.startDay}
                          onChange={(event) => handleSameDayStartDayChange(Number(event.target.value))}
                          className="h-8 w-16 rounded-xl border border-input bg-background px-2 text-xs"
                          aria-label="Same-day comparison start day"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1 text-xs text-foreground">
                        <span>To</span>
                        <input
                          type="number"
                          min={sameDayPaceDayRange.startDay}
                          max={sameDayPaceMaxDay}
                          value={sameDayPaceDayRange.endDay}
                          onChange={(event) => handleSameDayEndDayChange(Number(event.target.value))}
                          className="h-8 w-16 rounded-xl border border-input bg-background px-2 text-xs"
                          aria-label="Same-day comparison end day"
                        />
                      </label>
                      <span className="text-[11px] text-muted-foreground">
                        Max {sameDayPaceMaxDay}
                      </span>
                    </fieldset>
                  ) : null}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sameDayToneClassName}`}>
                    {sameDayPace.headline}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-foreground">{sameDayPace.summary}</p>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                        Current
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {formatAmountRM(sameDayPace.currentTotal)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                        Previous
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {formatAmountRM(sameDayPace.previousTotal)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                        Gap
                      </p>
                      <p className={sameDayPace.difference < 0 ? "mt-1 text-sm font-semibold text-destructive" : "mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300"}>
                        {formatCollectionMonthlyComparisonDifference(sameDayPace.difference)}
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
                        {formatAmountRM(sameDayPace.currentDailyAverage)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-3">
                    <div className="space-y-1">
                      <div className="flex justify-between gap-3 text-xs">
                        <span className="font-medium text-foreground">{sameDayPace.currentLabel}</span>
                        <span className="text-muted-foreground">{formatAmountRM(sameDayPace.currentTotal)}</span>
                      </div>
                      <progress
                        className="collection-monthly-comparison-progress collection-monthly-comparison-progress--current"
                        max={sameDayPaceMax}
                        value={Math.max(0, sameDayPace.currentTotal)}
                        aria-label={`${sameDayPace.currentLabel} same-day total`}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between gap-3 text-xs">
                        <span className="font-medium text-foreground">{sameDayPace.previousLabel}</span>
                        <span className="text-muted-foreground">{formatAmountRM(sameDayPace.previousTotal)}</span>
                      </div>
                      <progress
                        className="collection-monthly-comparison-progress collection-monthly-comparison-progress--previous"
                        max={sameDayPaceMax}
                        value={Math.max(0, sameDayPace.previousTotal)}
                        aria-label={`${sameDayPace.previousLabel} same-day total`}
                      />
                    </div>
                    {sameDayPace.target ? (
                      <div className="space-y-1">
                        <div className="flex justify-between gap-3 text-xs">
                          <span className="font-medium text-foreground">Expected range target pace</span>
                          <span className="text-muted-foreground">{formatAmountRM(sameDayPace.target.expectedByToday)}</span>
                        </div>
                        <progress
                          className="collection-monthly-comparison-progress collection-monthly-comparison-progress--target"
                          max={sameDayPaceMax}
                          value={Math.max(0, sameDayPace.target.expectedByToday)}
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
                      {sameDayPace.insights.slice(0, 5).map((insight) => (
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
                      <p className="mt-1 text-sm font-semibold text-foreground">{sameDayPace.momentum.label}</p>
                      <p className="text-xs text-muted-foreground">{sameDayPace.momentum.description}</p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                        Target pace
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {sameDayPace.target ? sameDayPace.target.label : "No target configured"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sameDayPace.target
                          ? `${formatCollectionMonthlyComparisonDifference(sameDayPace.target.paceGap)} vs expected range pace`
                          : "Superuser target is needed for target pacing."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {!sameDayPaceLoading && !sameDayPaceErrorMessage && !sameDayPace && sameDayPaceUnavailableReason ? (
            <p className="rounded-2xl border border-dashed border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">
              {sameDayPaceUnavailableReason}
            </p>
          ) : null}

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
        </div>
      ) : null}
    </section>
  );
}
