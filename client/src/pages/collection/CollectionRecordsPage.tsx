import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="border-border/60 bg-background/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">View Rekod Collection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CollectionRecordsFilters {...viewModel.filters} />

          <CollectionRecordsToolbar {...viewModel.toolbar} />

          <CollectionRecordsTable {...viewModel.table} />
        </CardContent>
      </Card>

      <ReceiptPreviewDialog {...viewModel.receiptPreview} />

      <EditCollectionRecordDialog {...viewModel.editDialog} />

      <DeleteCollectionRecordDialog {...viewModel.deleteDialog} />

      <PurgeCollectionRecordsDialog {...viewModel.purgeDialog} />

      <ViewAllRecordsDialog {...viewModel.viewAll} />
    </div>
  );
}

const MemoizedCollectionRecordsPage = memo(CollectionRecordsPage);
MemoizedCollectionRecordsPage.displayName = "CollectionRecordsPage";

export default MemoizedCollectionRecordsPage;
