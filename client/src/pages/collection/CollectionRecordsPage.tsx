import { memo, useMemo } from "react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { CollectionRecordsFilters } from "@/pages/collection-records/CollectionRecordsFilters";
import { CollectionRecordsTable } from "@/pages/collection-records/CollectionRecordsTable";
import { DeleteCollectionRecordDialog } from "@/pages/collection-records/DeleteCollectionRecordDialog";
import { CollectionRecordsToolbar } from "@/pages/collection-records/CollectionRecordsToolbar";
import { EditCollectionRecordDialog } from "@/pages/collection-records/EditCollectionRecordDialog";
import { PurgeCollectionRecordsDialog } from "@/pages/collection-records/PurgeCollectionRecordsDialog";
import { ReceiptPreviewDialog } from "@/pages/collection-records/ReceiptPreviewDialog";
import { buildCollectionRecordsPageViewModel } from "@/pages/collection-records/collection-records-page-view-models";
import { ViewAllRecordsDialog } from "@/pages/collection-records/ViewAllRecordsDialog";
import { useCollectionRecordsController } from "@/pages/collection-records/useCollectionRecordsController";

type CollectionRecordsPageProps = {
  role: string;
};

function CollectionRecordsPage({ role }: CollectionRecordsPageProps) {
  const controller = useCollectionRecordsController({ role });
  const viewModel = buildCollectionRecordsPageViewModel(controller);
  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const items: ActiveFilterChip[] = [];
    if (viewModel.filters.fromDate) {
      items.push({
        id: "collection-from-date",
        label: `From ${formatIsoDateToDDMMYYYY(viewModel.filters.fromDate)}`,
        onRemove: () => viewModel.filters.onFromDateChange(""),
      });
    }
    if (viewModel.filters.toDate) {
      items.push({
        id: "collection-to-date",
        label: `To ${formatIsoDateToDDMMYYYY(viewModel.filters.toDate)}`,
        onRemove: () => viewModel.filters.onToDateChange(""),
      });
    }
    if (viewModel.filters.searchInput.trim()) {
      items.push({
        id: "collection-search",
        label: `Search: ${viewModel.filters.searchInput.trim()}`,
        onRemove: () => viewModel.filters.onSearchInputChange(""),
      });
    }
    if (viewModel.filters.canUseNicknameFilter && viewModel.filters.nicknameFilter !== "all") {
      items.push({
        id: "collection-nickname",
        label: `Nickname: ${viewModel.filters.nicknameFilter}`,
        onRemove: () => viewModel.filters.onNicknameFilterChange("all"),
      });
    }
    return items;
  }, [
    viewModel.filters.canUseNicknameFilter,
    viewModel.filters.fromDate,
    viewModel.filters.nicknameFilter,
    viewModel.filters.onFromDateChange,
    viewModel.filters.onNicknameFilterChange,
    viewModel.filters.onSearchInputChange,
    viewModel.filters.onToDateChange,
    viewModel.filters.searchInput,
    viewModel.filters.toDate,
  ]);

  return (
    <div className="space-y-3">
      <OperationalSectionCard
        title="View Rekod Collection"
        description="Search, review, export, and maintain collection records from one calmer workspace."
        contentClassName="space-y-3"
      >
        <div className="ops-toolbar">
          <CollectionRecordsFilters {...viewModel.filters} />
        </div>

        <ActiveFilterChips items={activeFilterChips} onClearAll={viewModel.filters.onReset} />

        <CollectionRecordsToolbar {...viewModel.toolbar} />

        <CollectionRecordsTable {...viewModel.table} />
      </OperationalSectionCard>

      {viewModel.receiptPreview.open ? (
        <ReceiptPreviewDialog {...viewModel.receiptPreview} />
      ) : null}

      {viewModel.editDialog.open ? (
        <EditCollectionRecordDialog {...viewModel.editDialog} />
      ) : null}

      {viewModel.deleteDialog.open ? (
        <DeleteCollectionRecordDialog {...viewModel.deleteDialog} />
      ) : null}

      {viewModel.purgeDialog.open ? (
        <PurgeCollectionRecordsDialog {...viewModel.purgeDialog} />
      ) : null}

      {viewModel.viewAll.open ? (
        <ViewAllRecordsDialog {...viewModel.viewAll} />
      ) : null}
    </div>
  );
}

const MemoizedCollectionRecordsPage = memo(CollectionRecordsPage);
MemoizedCollectionRecordsPage.displayName = "CollectionRecordsPage";

export default MemoizedCollectionRecordsPage;
