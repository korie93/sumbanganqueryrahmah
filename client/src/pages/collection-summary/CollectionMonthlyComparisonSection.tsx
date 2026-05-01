import { Suspense, lazy, memo } from "react";
import type { CollectionStaffNickname } from "@/lib/api";
import { CollectionMonthlyComparisonPanel } from "./CollectionMonthlyComparisonPanel";
import { useCollectionMonthlyComparisonData } from "./useCollectionMonthlyComparisonData";

const MonthlyCollectionComparisonChart = lazy(() =>
  import("./MonthlyCollectionComparisonChart").then((module) => ({
    default: module.MonthlyCollectionComparisonChart,
  })),
);

type CollectionMonthlyComparisonSectionProps = {
  canFilterByNickname: boolean;
  currentNickname: string;
  nicknameOptions: CollectionStaffNickname[];
};

function CollectionMonthlyComparisonSection({
  canFilterByNickname,
  currentNickname,
  nicknameOptions,
}: CollectionMonthlyComparisonSectionProps) {
  const comparisonData = useCollectionMonthlyComparisonData({
    canFilterByNickname,
    currentNickname,
    nicknameOptions,
  });

  return (
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
      onSelectedNicknameChange={comparisonData.setSelectedNickname}
      onStartMonthChange={comparisonData.setStartMonth}
      onEndMonthChange={comparisonData.setEndMonth}
      onApply={comparisonData.apply}
      onReset={comparisonData.reset}
      chartSlot={
        comparisonData.data ? (
          <Suspense fallback={null}>
            <MonthlyCollectionComparisonChart data={comparisonData.data} />
          </Suspense>
        ) : null
      }
    />
  );
}

const MemoizedCollectionMonthlyComparisonSection = memo(CollectionMonthlyComparisonSection);
MemoizedCollectionMonthlyComparisonSection.displayName = "CollectionMonthlyComparisonSection";

export { MemoizedCollectionMonthlyComparisonSection as CollectionMonthlyComparisonSection };
