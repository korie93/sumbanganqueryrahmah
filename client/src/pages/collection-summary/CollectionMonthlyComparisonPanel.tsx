import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import type {
  CollectionMonthlyComparisonResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatAmountRM } from "@/pages/collection/utils";
import { CollectionMonthlyComparisonBreakdownSection } from "./CollectionMonthlyComparisonBreakdownSection";
import { CollectionMonthlyComparisonHeader } from "./CollectionMonthlyComparisonHeader";
import { CollectionMonthlyComparisonInsightsSection } from "./CollectionMonthlyComparisonInsightsSection";
import { CollectionMonthlyComparisonSetupCard } from "./CollectionMonthlyComparisonSetupCard";
import { CollectionMonthlyComparisonStateMessages } from "./CollectionMonthlyComparisonStateMessages";
import { CollectionSameDayPaceSection } from "./CollectionSameDayPaceSection";
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
  formatCollectionMonthlyComparisonPercentage,
  resolveCollectionMonthlyComparisonTone,
  type CollectionMonthlyComparisonPresetRange,
  type CollectionMonthlyComparisonTargetLookup,
  type CollectionSameDayPaceComparison,
  type CollectionSameDayPaceComparisonMode,
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
  sameDayPaceComparisonMode?: CollectionSameDayPaceComparisonMode | undefined;
  onExportCsv?: (() => void) | undefined;
  onPrintReport?: (() => void) | undefined;
  onMonthSelect?: ((monthKey: string) => void) | undefined;
  onSameDayPaceDayRangeChange?: ((range: CollectionSameDayPaceDayRange) => void) | undefined;
  onSameDayPaceComparisonModeChange?: ((mode: CollectionSameDayPaceComparisonMode) => void) | undefined;
  chartSlot?: ReactNode | undefined;
};

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
  sameDayPaceComparisonMode = "selected-start-month",
  onExportCsv,
  onPrintReport,
  onMonthSelect,
  onSameDayPaceDayRangeChange,
  onSameDayPaceComparisonModeChange,
  chartSlot,
}: CollectionMonthlyComparisonPanelProps) {
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
  const baseMonthRecordCount = comparison?.baseMonth
    ? data?.months.find((entry) => entry.month === comparison.baseMonth)?.recordCount || 0
    : 0;
  const targetMonthRecordCount = comparison
    ? data?.months.find((entry) => entry.month === comparison.targetMonth)?.recordCount || 0
    : 0;
  const rangePresets = useMemo(
    () => buildCollectionMonthlyComparisonPresetRanges(),
    [],
  );

  return (
    <section
      aria-labelledby="collection-monthly-comparison-title"
      className={cn(
        "collection-monthly-comparison-panel space-y-4",
        !standalone && "border-t border-border/60 pt-4",
      )}
      data-floating-ai-avoid="true"
    >
      <CollectionMonthlyComparisonHeader showHeader={showHeader} />

      <CollectionMonthlyComparisonSetupCard
        availableNicknames={availableNicknames}
        canFilterByNickname={canFilterByNickname}
        data={data}
        endMonth={endMonth}
        hasAvailableNickname={hasAvailableNickname}
        loading={loading}
        monthlyTargetAmount={monthlyTargetAmount}
        monthlyTargetErrorMessage={monthlyTargetErrorMessage}
        monthlyTargetLoading={monthlyTargetLoading}
        monthlyTargetSourceLabel={monthlyTargetSourceLabel}
        monthlyTargetsByMonth={monthlyTargetsByMonth}
        onApply={onApply}
        onEndMonthChange={onEndMonthChange}
        onExportCsv={onExportCsv}
        onPrintReport={onPrintReport}
        onRangePresetApply={onRangePresetApply}
        onReset={onReset}
        onSelectedNicknameChange={onSelectedNicknameChange}
        onStartMonthChange={onStartMonthChange}
        rangePresets={rangePresets}
        selectedNickname={selectedNickname}
        startMonth={startMonth}
        targetSummary={targetSummary}
      />

      <CollectionMonthlyComparisonStateMessages
        errorMessage={errorMessage}
        hasAvailableNickname={hasAvailableNickname}
        loading={loading}
      />

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

          <CollectionSameDayPaceSection
            comparisonMode={sameDayPaceComparisonMode}
            errorMessage={sameDayPaceErrorMessage}
            loading={sameDayPaceLoading}
            maxDay={sameDayPaceMaxDay}
            onComparisonModeChange={onSameDayPaceComparisonModeChange}
            onDayRangeChange={onSameDayPaceDayRangeChange}
            pace={sameDayPace}
            selectedDayRange={sameDayPaceDayRange}
            unavailableReason={sameDayPaceUnavailableReason}
          />

          {insights ? (
            <CollectionMonthlyComparisonInsightsSection
              benchmarks={benchmarks}
              comparison={comparison}
              dataQualitySummary={dataQualitySummary}
              insights={insights}
              projection={projection}
              targetSummary={targetSummary}
              trendExplanation={trendExplanation}
            />
          ) : null}
          {comparisonSummary ? <p className="sr-only">{comparisonSummary}</p> : null}

          <CollectionMonthlyComparisonBreakdownSection
            chartSlot={chartSlot}
            insights={insights}
            monthCount={data.months.length}
            monthlyTargetsByMonth={monthlyTargetsByMonth}
            onMonthSelect={onMonthSelect}
            targetSummary={targetSummary}
          />
        </div>
      ) : null}
    </section>
  );
}
