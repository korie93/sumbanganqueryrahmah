import { memo } from "react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { CollectionMonthDetailsDialog } from "@/pages/collection-summary/CollectionMonthDetailsDialog";
import { buildCollectionSummaryPageViewModels } from "@/pages/collection-summary/collection-summary-page-view-models";
import { CollectionSummaryFilters } from "@/pages/collection-summary/CollectionSummaryFilters";
import { useCollectionSummaryData } from "@/pages/collection-summary/useCollectionSummaryData";
import { useCollectionSummaryMonthDialog } from "@/pages/collection-summary/useCollectionSummaryMonthDialog";
import { CollectionSummaryTable } from "@/pages/collection-summary/CollectionSummaryTable";
import { CollectionSummaryTotals } from "@/pages/collection-summary/CollectionSummaryTotals";

type CollectionSummaryPageProps = {
  role: string;
};

function CollectionSummaryPage({ role }: CollectionSummaryPageProps) {
  const canFilterByNickname = role === "admin" || role === "superuser";
  const summaryData = useCollectionSummaryData({ canFilterByNickname });
  const { handleSelectMonth, monthDialog, selectedMonth } =
    useCollectionSummaryMonthDialog({
      canFilterByNickname,
      selectedYear: summaryData.selectedYear,
      selectedNicknames: summaryData.selectedNicknames,
      summaryRows: summaryData.summaryRows,
    });
  const viewModels = buildCollectionSummaryPageViewModels({
    canFilterByNickname,
    summaryData,
    monthDialogState: {
      handleSelectMonth,
      monthDialog,
      selectedMonth,
    },
  });

  return (
    <OperationalSectionCard
      title="Collection Summary"
      description={summaryData.freshness?.message || "Review monthly totals with a cleaner month-by-month drill-down flow."}
      badge={<CollectionReportFreshnessBadge freshness={summaryData.freshness} />}
      contentClassName="space-y-4"
    >
      <div className="ops-toolbar">
        <CollectionSummaryFilters {...viewModels.filters} />
      </div>

      <CollectionSummaryTable {...viewModels.table} />

      <CollectionSummaryTotals {...viewModels.totals} />

      {viewModels.monthDialog ? <CollectionMonthDetailsDialog {...viewModels.monthDialog} /> : null}
    </OperationalSectionCard>
  );
}

const MemoizedCollectionSummaryPage = memo(CollectionSummaryPage);
MemoizedCollectionSummaryPage.displayName = "CollectionSummaryPage";

export default MemoizedCollectionSummaryPage;
