import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="border-border/60 bg-background/70">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Collection Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CollectionSummaryFilters {...viewModels.filters} />

        <CollectionSummaryTable {...viewModels.table} />

        <CollectionSummaryTotals {...viewModels.totals} />
      </CardContent>

      {viewModels.monthDialog ? <CollectionMonthDetailsDialog {...viewModels.monthDialog} /> : null}
    </Card>
  );
}

const MemoizedCollectionSummaryPage = memo(CollectionSummaryPage);
MemoizedCollectionSummaryPage.displayName = "CollectionSummaryPage";

export default MemoizedCollectionSummaryPage;
