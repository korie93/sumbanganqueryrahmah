import type { CollectionMonthDetailsDialogProps } from "@/pages/collection-summary/CollectionMonthDetailsDialog";
import type { CollectionSummaryFiltersProps } from "@/pages/collection-summary/CollectionSummaryFilters";
import type { CollectionSummaryTableProps } from "@/pages/collection-summary/CollectionSummaryTable";
import type { CollectionSummaryTotalsProps } from "@/pages/collection-summary/CollectionSummaryTotals";
import type { useCollectionSummaryData } from "@/pages/collection-summary/useCollectionSummaryData";
import type { useCollectionSummaryMonthDialog } from "@/pages/collection-summary/useCollectionSummaryMonthDialog";

type CollectionSummaryDataValue = ReturnType<typeof useCollectionSummaryData>;
type CollectionSummaryMonthDialogValue = ReturnType<typeof useCollectionSummaryMonthDialog>;

type BuildCollectionSummaryPageViewModelsOptions = {
  canFilterByNickname: boolean;
  summaryData: CollectionSummaryDataValue;
  monthDialogState: CollectionSummaryMonthDialogValue;
};

type CollectionSummaryPageViewModels = {
  filters: CollectionSummaryFiltersProps;
  table: CollectionSummaryTableProps;
  totals: CollectionSummaryTotalsProps;
  monthDialog: CollectionMonthDetailsDialogProps | null;
};

export function buildCollectionSummaryPageViewModels({
  canFilterByNickname,
  summaryData,
  monthDialogState,
}: BuildCollectionSummaryPageViewModelsOptions): CollectionSummaryPageViewModels {
  const monthDialog =
    monthDialogState.monthDialog.open &&
    monthDialogState.monthDialog.selectedMonthSummary &&
    monthDialogState.monthDialog.selectedMonthRange
      ? monthDialogState.monthDialog
      : null;

  return {
    filters: {
      canFilterByNickname,
      selectedYear: summaryData.selectedYear,
      yearOptions: summaryData.yearOptions,
      nicknameDropdownOpen: summaryData.nicknameDropdownOpen,
      loading: summaryData.loading,
      visibleNicknameOptions: summaryData.visibleNicknameOptions,
      selectedNicknameSet: summaryData.selectedNicknameSet,
      selectedNicknameLabel: summaryData.selectedNicknameLabel,
      allSelected: summaryData.allSelected,
      partiallySelected: summaryData.partiallySelected,
      selectedNicknamesCount: summaryData.selectedNicknames.length,
      onSelectedYearChange: summaryData.setSelectedYear,
      onNicknameDropdownOpenChange: summaryData.setNicknameDropdownOpen,
      onToggleNickname: summaryData.toggleNickname,
      onSelectAllVisible: summaryData.selectAllVisible,
      onClearAllSelected: summaryData.clearAllSelected,
    },
    table: {
      loading: summaryData.loading,
      summaryRows: summaryData.summaryRows,
      selectedMonth: monthDialogState.selectedMonth,
      onSelectMonth: monthDialogState.handleSelectMonth,
    },
    totals: {
      grandTotal: summaryData.grandTotal,
    },
    monthDialog,
  };
}
