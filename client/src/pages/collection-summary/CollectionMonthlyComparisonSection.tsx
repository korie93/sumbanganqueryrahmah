import { Suspense, lazy, memo, useCallback } from "react";
import { downloadBlob } from "@/lib/download";
import type { CollectionStaffNickname } from "@/lib/api";
import { CollectionMonthlyComparisonPanel } from "./CollectionMonthlyComparisonPanel";
import {
  buildCollectionMonthlyComparisonCsv,
  buildCollectionMonthlyComparisonCsvFilename,
  buildCollectionMonthlyComparisonPrintReportHtml,
} from "./collection-monthly-comparison-utils";
import { useCollectionMonthlyComparisonData } from "./useCollectionMonthlyComparisonData";
import { useCollectionMonthlyComparisonMonthDialog } from "./useCollectionMonthlyComparisonMonthDialog";
import { useCollectionMonthlyComparisonTarget } from "./useCollectionMonthlyComparisonTarget";
import { useCollectionMonthlySameDayPace } from "./useCollectionMonthlySameDayPace";

const MonthlyCollectionComparisonChart = lazy(() =>
  import("./MonthlyCollectionComparisonChart").then((module) => ({
    default: module.MonthlyCollectionComparisonChart,
  })),
);
const MonthlySameDayPaceChart = lazy(() =>
  import("./MonthlySameDayPaceChart").then((module) => ({
    default: module.MonthlySameDayPaceChart,
  })),
);
const CollectionMonthDetailsDialog = lazy(() =>
  import("./CollectionMonthDetailsDialog").then((module) => ({
    default: module.CollectionMonthDetailsDialog,
  })),
);

type CollectionMonthlyComparisonSectionProps = {
  canFilterByNickname: boolean;
  currentNickname: string;
  nicknameOptions: CollectionStaffNickname[];
  showHeader?: boolean | undefined;
  standalone?: boolean | undefined;
};

function CollectionMonthlyComparisonSection({
  canFilterByNickname,
  currentNickname,
  nicknameOptions,
  showHeader = true,
  standalone = false,
}: CollectionMonthlyComparisonSectionProps) {
  const comparisonData = useCollectionMonthlyComparisonData({
    canFilterByNickname,
    currentNickname,
    nicknameOptions,
  });
  const comparisonMonthDialog = useCollectionMonthlyComparisonMonthDialog({
    data: comparisonData.data,
  });
  const comparisonTarget = useCollectionMonthlyComparisonTarget(comparisonData.data);
  const sameDayPace = useCollectionMonthlySameDayPace({
    data: comparisonData.data,
    monthlyTargetAmount: comparisonTarget.monthlyTargetAmount,
    monthlyTargetsByMonth: comparisonTarget.targetsByMonth,
  });
  const handleExportCsv = useCallback(() => {
    if (!comparisonData.data) {
      return;
    }

    const csvContent = buildCollectionMonthlyComparisonCsv(
      comparisonData.data,
      {
        monthlyTargetAmount: comparisonTarget.monthlyTargetAmount,
        monthlyTargetsByMonth: comparisonTarget.targetsByMonth,
        sameDayPace: sameDayPace.pace,
      },
    );
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, buildCollectionMonthlyComparisonCsvFilename(comparisonData.data));
  }, [comparisonData.data, comparisonTarget.monthlyTargetAmount, comparisonTarget.targetsByMonth, sameDayPace.pace]);
  const handlePrintReport = useCallback(() => {
    if (!comparisonData.data) {
      return;
    }

    const reportHtml = buildCollectionMonthlyComparisonPrintReportHtml(
      comparisonData.data,
      {
        monthlyTargetAmount: comparisonTarget.monthlyTargetAmount,
        monthlyTargetsByMonth: comparisonTarget.targetsByMonth,
        monthlyTargetSourceLabel: comparisonTarget.sourceLabel,
        sameDayPace: sameDayPace.pace,
      },
    );
    const reportWindow = window.open("", "_blank", "width=1120,height=820");
    if (!reportWindow) {
      const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8;" });
      downloadBlob(
        blob,
        buildCollectionMonthlyComparisonCsvFilename(comparisonData.data).replace(/\.csv$/i, ".html"),
      );
      return;
    }

    reportWindow.opener = null;
    reportWindow.document.open();
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
    reportWindow.focus();
  }, [
    comparisonData.data,
    comparisonTarget.monthlyTargetAmount,
    comparisonTarget.targetsByMonth,
    comparisonTarget.sourceLabel,
    sameDayPace.pace,
  ]);

  return (
    <>
      <CollectionMonthlyComparisonPanel
        canFilterByNickname={canFilterByNickname}
        availableNicknames={comparisonData.availableNicknames}
        selectedNickname={comparisonData.selectedNickname}
        startMonth={comparisonData.startMonth}
        endMonth={comparisonData.endMonth}
        loading={comparisonData.loading}
        errorMessage={comparisonData.errorMessage}
        data={comparisonData.data}
        hasAvailableNickname={comparisonData.hasAvailableNickname}
        showHeader={showHeader}
        standalone={standalone}
        onSelectedNicknameChange={comparisonData.setSelectedNickname}
        onStartMonthChange={comparisonData.setStartMonth}
        onEndMonthChange={comparisonData.setEndMonth}
        onApply={comparisonData.apply}
        onRangePresetApply={comparisonData.applyRangePreset}
        onReset={comparisonData.reset}
        monthlyTargetAmount={comparisonTarget.monthlyTargetAmount}
        monthlyTargetsByMonth={comparisonTarget.targetsByMonth}
        monthlyTargetLoading={comparisonTarget.loading}
        monthlyTargetErrorMessage={comparisonTarget.errorMessage}
        monthlyTargetSourceLabel={comparisonTarget.sourceLabel}
        sameDayPace={sameDayPace.pace}
        sameDayPaceLoading={sameDayPace.loading}
        sameDayPaceErrorMessage={sameDayPace.errorMessage}
        sameDayPaceUnavailableReason={sameDayPace.unavailableReason}
        sameDayPaceDayRange={sameDayPace.dayRange}
        sameDayPaceMaxDay={sameDayPace.maxDay}
        sameDayPaceComparisonMode={sameDayPace.comparisonMode}
        onSameDayPaceDayRangeChange={sameDayPace.setDayRange}
        onSameDayPaceComparisonModeChange={sameDayPace.setComparisonMode}
        onExportCsv={handleExportCsv}
        onPrintReport={handlePrintReport}
        onMonthSelect={comparisonMonthDialog.handleSelectMonth}
        chartSlot={
          comparisonData.data ? (
            <>
              {sameDayPace.loading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-2xl border border-border/60 bg-background px-4 py-6 text-sm text-muted-foreground shadow-sm"
                >
                  Loading same-day pace chart...
                </div>
              ) : null}
              {!sameDayPace.loading && sameDayPace.errorMessage ? (
                <p
                  role="alert"
                  className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
                >
                  Same-day pace chart unavailable: {sameDayPace.errorMessage}
                </p>
              ) : null}
              {!sameDayPace.loading && !sameDayPace.errorMessage && sameDayPace.pace ? (
                <Suspense
                  fallback={(
                    <div className="rounded-2xl border border-border/60 bg-background px-4 py-6 text-sm text-muted-foreground shadow-sm">
                      Loading same-day pace chart...
                    </div>
                  )}
                >
                  <MonthlySameDayPaceChart pace={sameDayPace.pace} />
                </Suspense>
              ) : null}
              <Suspense
                fallback={(
                  <div className="rounded-2xl border border-border/60 bg-background px-4 py-6 text-sm text-muted-foreground shadow-sm">
                    Loading monthly comparison chart...
                  </div>
                )}
              >
                <MonthlyCollectionComparisonChart
                  data={comparisonData.data}
                  monthlyTargetAmount={comparisonTarget.monthlyTargetAmount}
                  monthlyTargetsByMonth={comparisonTarget.targetsByMonth}
                  monthlyTargetLoading={comparisonTarget.loading}
                  monthlyTargetSourceLabel={comparisonTarget.sourceLabel}
                  onMonthSelect={comparisonMonthDialog.handleSelectMonth}
                />
              </Suspense>
            </>
          ) : null
        }
      />
      {comparisonMonthDialog.monthDialog.open &&
      comparisonMonthDialog.monthDialog.selectedMonthSummary &&
      comparisonMonthDialog.monthDialog.selectedMonthRange ? (
        <Suspense fallback={null}>
          <CollectionMonthDetailsDialog {...comparisonMonthDialog.monthDialog} />
        </Suspense>
      ) : null}
    </>
  );
}

const MemoizedCollectionMonthlyComparisonSection = memo(CollectionMonthlyComparisonSection);
MemoizedCollectionMonthlyComparisonSection.displayName = "CollectionMonthlyComparisonSection";

export { MemoizedCollectionMonthlyComparisonSection as CollectionMonthlyComparisonSection };
