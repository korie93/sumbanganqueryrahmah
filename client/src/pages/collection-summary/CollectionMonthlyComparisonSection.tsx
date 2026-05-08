import { Suspense, lazy, memo, useCallback, useMemo, useState } from "react";
import { downloadBlob } from "@/lib/download";
import type { CollectionStaffNickname } from "@/lib/api";
import { CollectionMonthlyComparisonPanel } from "./CollectionMonthlyComparisonPanel";
import {
  buildCollectionMonthlyComparisonCsv,
  buildCollectionMonthlyComparisonCsvFilename,
  normalizeCollectionMonthlyTargetAmount,
} from "./collection-monthly-comparison-utils";
import { useCollectionMonthlyComparisonData } from "./useCollectionMonthlyComparisonData";
import { useCollectionMonthlyComparisonMonthDialog } from "./useCollectionMonthlyComparisonMonthDialog";

const MonthlyCollectionComparisonChart = lazy(() =>
  import("./MonthlyCollectionComparisonChart").then((module) => ({
    default: module.MonthlyCollectionComparisonChart,
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
  const [monthlyTargetInput, setMonthlyTargetInput] = useState("");
  const monthlyTargetAmount = useMemo(
    () => normalizeCollectionMonthlyTargetAmount(monthlyTargetInput),
    [monthlyTargetInput],
  );
  const handleExportCsv = useCallback(() => {
    if (!comparisonData.data) {
      return;
    }

    const csvContent = buildCollectionMonthlyComparisonCsv(
      comparisonData.data,
      monthlyTargetAmount,
    );
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, buildCollectionMonthlyComparisonCsvFilename(comparisonData.data));
  }, [comparisonData.data, monthlyTargetAmount]);

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
        monthlyTargetInput={monthlyTargetInput}
        monthlyTargetAmount={monthlyTargetAmount}
        onMonthlyTargetInputChange={setMonthlyTargetInput}
        onExportCsv={handleExportCsv}
        onMonthSelect={comparisonMonthDialog.handleSelectMonth}
        chartSlot={
          comparisonData.data ? (
            <Suspense
              fallback={(
                <div className="rounded-2xl border border-border/60 bg-background px-4 py-6 text-sm text-muted-foreground shadow-sm">
                  Loading monthly comparison chart...
                </div>
              )}
            >
              <MonthlyCollectionComparisonChart
                data={comparisonData.data}
                monthlyTargetAmount={monthlyTargetAmount}
              />
            </Suspense>
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
