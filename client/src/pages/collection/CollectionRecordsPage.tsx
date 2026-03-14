import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollectionRecordsFilters } from "@/pages/collection-records/CollectionRecordsFilters";
import { CollectionRecordsTable } from "@/pages/collection-records/CollectionRecordsTable";
import { DeleteCollectionRecordDialog } from "@/pages/collection-records/DeleteCollectionRecordDialog";
import { CollectionRecordsToolbar } from "@/pages/collection-records/CollectionRecordsToolbar";
import { EditCollectionRecordDialog } from "@/pages/collection-records/EditCollectionRecordDialog";
import { PurgeCollectionRecordsDialog } from "@/pages/collection-records/PurgeCollectionRecordsDialog";
import { ReceiptPreviewDialog } from "@/pages/collection-records/ReceiptPreviewDialog";
import { toCollectionDisplayDate } from "@/pages/collection-records/utils";
import { ViewAllRecordsDialog } from "@/pages/collection-records/ViewAllRecordsDialog";
import { useCollectionRecordsController } from "@/pages/collection-records/useCollectionRecordsController";

type CollectionRecordsPageProps = {
  role: string;
};

function CollectionRecordsPage({ role }: CollectionRecordsPageProps) {
  const controller = useCollectionRecordsController({ role });

  return (
    <div className="space-y-3">
      <Card className="border-border/60 bg-background/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">View Rekod Collection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CollectionRecordsFilters
            canUseNicknameFilter={controller.canUseNicknameFilter}
            {...controller.filters}
          />

          <CollectionRecordsToolbar {...controller.toolbar} />

          <CollectionRecordsTable
            loadingRecords={controller.table.loadingRecords}
            visibleRecords={controller.table.visibleRecords}
            paginatedRecords={controller.table.paginatedRecords}
            pageOffset={controller.table.pageOffset}
            canEdit={controller.canEdit}
            onViewReceipt={controller.table.onViewReceipt}
            onEdit={controller.table.onEdit}
            onDelete={controller.table.onDelete}
            canDeleteRow={controller.table.canDeleteRow}
          />
        </CardContent>
      </Card>

      <ReceiptPreviewDialog {...controller.receiptPreview} />

      <EditCollectionRecordDialog {...controller.editDialog} />

      <DeleteCollectionRecordDialog {...controller.deleteDialog} />

      <PurgeCollectionRecordsDialog {...controller.purgeDialog} />

      <ViewAllRecordsDialog
        open={controller.viewAll.open}
        loading={controller.viewAll.loading}
        fromDate={controller.viewAll.fromDate}
        toDate={controller.viewAll.toDate}
        viewAllRecords={controller.viewAll.records}
        viewAllSummary={controller.viewAll.summary}
        page={controller.viewAll.page}
        pageSize={controller.viewAll.pageSize}
        totalPages={controller.viewAll.totalPages}
        onOpenChange={controller.viewAll.onOpenChange}
        onPageChange={controller.viewAll.onPageChange}
        onPageSizeChange={controller.viewAll.onPageSizeChange}
        onViewReceipt={controller.viewAll.onViewReceipt}
        toDisplayDate={toCollectionDisplayDate}
      />
    </div>
  );
}

const MemoizedCollectionRecordsPage = memo(CollectionRecordsPage);
MemoizedCollectionRecordsPage.displayName = "CollectionRecordsPage";

export default MemoizedCollectionRecordsPage;
