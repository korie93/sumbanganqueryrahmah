import { memo } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
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
