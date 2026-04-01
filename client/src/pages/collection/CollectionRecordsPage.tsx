import { Suspense, lazy, memo, useMemo } from "react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { CollectionRecordsTable } from "@/pages/collection-records/CollectionRecordsTable";
import { buildCollectionRecordsPageViewModel } from "@/pages/collection-records/collection-records-page-view-models";
import { useCollectionRecordsController } from "@/pages/collection-records/useCollectionRecordsController";

const CollectionRecordsFilters = lazy(() =>
  import("@/pages/collection-records/CollectionRecordsFilters").then((module) => ({
    default: module.CollectionRecordsFilters,
  })),
);
const CollectionRecordsToolbar = lazy(() =>
  import("@/pages/collection-records/CollectionRecordsToolbar").then((module) => ({
    default: module.CollectionRecordsToolbar,
  })),
);
const ReceiptPreviewDialog = lazy(() =>
  import("@/pages/collection-records/ReceiptPreviewDialog").then((module) => ({
    default: module.ReceiptPreviewDialog,
  })),
);
const EditCollectionRecordDialog = lazy(() =>
  import("@/pages/collection-records/EditCollectionRecordDialog").then((module) => ({
    default: module.EditCollectionRecordDialog,
  })),
);
const DeleteCollectionRecordDialog = lazy(() =>
  import("@/pages/collection-records/DeleteCollectionRecordDialog").then((module) => ({
    default: module.DeleteCollectionRecordDialog,
  })),
);
const PurgeCollectionRecordsDialog = lazy(() =>
  import("@/pages/collection-records/PurgeCollectionRecordsDialog").then((module) => ({
    default: module.PurgeCollectionRecordsDialog,
  })),
);
const ViewAllRecordsDialog = lazy(() =>
  import("@/pages/collection-records/ViewAllRecordsDialog").then((module) => ({
    default: module.ViewAllRecordsDialog,
  })),
);

type CollectionRecordsPageProps = {
  role: string;
};

function CollectionRecordsFiltersFallback() {
  return (
    <div className="ops-toolbar space-y-3">
      <div className="grid gap-3 xl:grid-cols-[170px_170px_minmax(260px,1fr)_190px_auto_auto]">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-16 animate-pulse rounded-xl border border-border/60 bg-muted/20"
          />
        ))}
      </div>
    </div>
  );
}

function CollectionRecordsToolbarFallback() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-xl border border-border/60 bg-muted/20"
          />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
      <div className="h-16 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
    </div>
  );
}

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
          <Suspense fallback={<CollectionRecordsFiltersFallback />}>
            <CollectionRecordsFilters {...viewModel.filters} />
          </Suspense>
        </div>

        <ActiveFilterChips items={activeFilterChips} onClearAll={viewModel.filters.onReset} />

        <Suspense fallback={<CollectionRecordsToolbarFallback />}>
          <CollectionRecordsToolbar {...viewModel.toolbar} />
        </Suspense>

        <CollectionRecordsTable {...viewModel.table} />
      </OperationalSectionCard>

      {viewModel.receiptPreview.open ? (
        <Suspense fallback={null}>
          <ReceiptPreviewDialog {...viewModel.receiptPreview} />
        </Suspense>
      ) : null}

      {viewModel.editDialog.open ? (
        <Suspense fallback={null}>
          <EditCollectionRecordDialog {...viewModel.editDialog} />
        </Suspense>
      ) : null}

      {viewModel.deleteDialog.open ? (
        <Suspense fallback={null}>
          <DeleteCollectionRecordDialog {...viewModel.deleteDialog} />
        </Suspense>
      ) : null}

      {viewModel.purgeDialog.open ? (
        <Suspense fallback={null}>
          <PurgeCollectionRecordsDialog {...viewModel.purgeDialog} />
        </Suspense>
      ) : null}

      {viewModel.viewAll.open ? (
        <Suspense fallback={null}>
          <ViewAllRecordsDialog {...viewModel.viewAll} />
        </Suspense>
      ) : null}
    </div>
  );
}

const MemoizedCollectionRecordsPage = memo(CollectionRecordsPage);
MemoizedCollectionRecordsPage.displayName = "CollectionRecordsPage";

export default MemoizedCollectionRecordsPage;
