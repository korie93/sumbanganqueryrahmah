import type { ReactNode } from "react";
import { useId, useMemo } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CollectionMonthlyComparisonResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatAmountRM } from "@/pages/collection/utils";
import { CollectionMonthlyComparisonBreakdownSection } from "./CollectionMonthlyComparisonBreakdownSection";
import { CollectionMonthlyComparisonHeader } from "./CollectionMonthlyComparisonHeader";
import { CollectionMonthlyComparisonInsightsSection } from "./CollectionMonthlyComparisonInsightsSection";
import { CollectionMonthlyComparisonLedger } from "./CollectionMonthlyComparisonLedger";
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
  sameDayPaceChartSlot?: ReactNode | undefined;
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
  sameDayPaceChartSlot,
}: CollectionMonthlyComparisonPanelProps) {
  const exportContextId = useId();
  const comparison = data?.comparison || null;
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
      <CollectionMonthlyComparisonHeader showHeader={showHeader} actions={
        onPrintReport || onExportCsv ? (
          <div className="monthly-comparison-header-actions">
            {onPrintReport ? (
              <Button type="button" variant="outline" onClick={onPrintReport}
                disabled={loading || monthlyTargetLoading || !data} aria-describedby={exportContextId}>
                <Printer className="h-4 w-4" aria-hidden="true" />Print report
              </Button>
            ) : null}
            {onExportCsv ? (
              <Button type="button" variant="outline" onClick={onExportCsv}
                disabled={loading || monthlyTargetLoading || !data} aria-describedby={exportContextId}>
                <Download className="h-4 w-4" aria-hidden="true" />Export CSV
              </Button>
            ) : null}
          </div>
        ) : null
      } />

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
        exportContextId={exportContextId}
        showExportActions={false}
      />

      <CollectionMonthlyComparisonStateMessages
        errorMessage={errorMessage}
        hasAvailableNickname={hasAvailableNickname}
        loading={loading}
      />

      {!loading && !errorMessage && data ? (
        <div className="monthly-comparison-report">
          <div className="monthly-comparison-headline" role="group" aria-label="First to last month comparison">
            <div className="monthly-comparison-headline-values">
              <div className="monthly-comparison-headline-group monthly-comparison-headline-range">
                <p className="monthly-comparison-headline-label">Comparison range</p>
                <strong>{comparison?.baseLabel || comparison?.targetLabel} {comparison?.baseLabel ? `→ ${comparison.targetLabel}` : ""}</strong>
              </div>
              <div className="monthly-comparison-headline-group monthly-comparison-headline-amounts">
                <p className="monthly-comparison-headline-label">First month → last month</p>
                <div className="monthly-comparison-headline-amounts-line">
                  {comparison?.baseTotal !== null && comparison?.baseTotal !== undefined ? (
                    <><span>{formatAmountRM(comparison.baseTotal)}</span>{" "}<span>→ {formatAmountRM(comparison.targetTotal)}</span></>
                  ) : <span>{formatAmountRM(comparison?.targetTotal || 0)}</span>}
                </div>
              </div>
              <div className="monthly-comparison-headline-group monthly-comparison-headline-change">
                <p className="monthly-comparison-headline-label">Change across range</p>
                {comparison?.baseMonth ? (
                  <strong className={cn(
                    comparison.direction === "increase" && "monthly-comparison-positive",
                    comparison.direction === "decrease" && "monthly-comparison-negative",
                  )}>
                    <span className="sr-only">Difference </span><span>{formatCollectionMonthlyComparisonDifference(comparison.difference)}</span>{" "}
                    <span className="monthly-comparison-headline-percentage">{comparison.percentageChange === null ? "N/A · RM0 base" : formatCollectionMonthlyComparisonPercentage(comparison.percentageChange)}</span>
                  </strong>
                ) : <span className="text-muted-foreground">Select at least two months to compare</span>}
              </div>
            </div>
          </div>

          <CollectionMonthlyComparisonLedger
            data={data}
            monthlyTargetAmount={monthlyTargetAmount}
            monthlyTargetsByMonth={monthlyTargetsByMonth}
            monthlyTargetLoading={monthlyTargetLoading}
            monthlyTargetSourceLabel={monthlyTargetSourceLabel}
            onMonthSelect={onMonthSelect}
          />

          <details className="collection-monthly-comparison-disclosure" data-testid="collection-monthly-same-day-analysis">
            <summary>Same-day pace analysis</summary>
            <div className="space-y-4 pb-4">
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
              {sameDayPaceChartSlot}
            </div>
          </details>

          {insights ? (
            <details className="collection-monthly-comparison-disclosure" data-testid="collection-monthly-detailed-analysis">
              <summary>Benchmarks, projections and data quality</summary>
              <CollectionMonthlyComparisonBreakdownSection
                chartSlot={chartSlot}
                insights={insights}
                monthCount={data.months.length}
                monthlyTargetsByMonth={monthlyTargetsByMonth}
                onMonthSelect={onMonthSelect}
                targetSummary={targetSummary}
              />
              <CollectionMonthlyComparisonInsightsSection
                benchmarks={benchmarks}
                comparison={comparison}
                dataQualitySummary={dataQualitySummary}
                insights={insights}
                projection={projection}
                targetSummary={targetSummary}
                trendExplanation={trendExplanation}
              />
            </details>
          ) : null}
          {comparisonSummary ? <p className="sr-only">{comparisonSummary}</p> : null}

        </div>
      ) : null}
    </section>
  );
}
