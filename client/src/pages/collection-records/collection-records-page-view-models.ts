import type { CollectionRecord } from "@/lib/api";
import type { CollectionRecordsFiltersProps } from "@/pages/collection-records/CollectionRecordsFilters";
import type { CollectionRecordsToolbarProps } from "@/pages/collection-records/CollectionRecordsToolbar";
import type { CollectionRecordsTableProps } from "@/pages/collection-records/CollectionRecordsTable";
import type { DeleteCollectionRecordDialogProps } from "@/pages/collection-records/DeleteCollectionRecordDialog";
import type { EditCollectionRecordDialogProps } from "@/pages/collection-records/EditCollectionRecordDialog";
import type { PurgeCollectionRecordsDialogProps } from "@/pages/collection-records/PurgeCollectionRecordsDialog";
import type { ReceiptPreviewDialogProps } from "@/pages/collection-records/ReceiptPreviewDialog";
import { toCollectionDisplayDate } from "@/pages/collection-records/utils";
import type { ViewAllRecordsDialogProps } from "@/pages/collection-records/ViewAllRecordsDialog";
import type { CollectionRecordsControllerValue } from "@/pages/collection-records/useCollectionRecordsController";

type CollectionRecordsPageViewModel = {
  filters: CollectionRecordsFiltersProps;
  toolbar: CollectionRecordsToolbarProps;
  table: CollectionRecordsTableProps;
  receiptPreview: ReceiptPreviewDialogProps;
  editDialog: EditCollectionRecordDialogProps;
  deleteDialog: DeleteCollectionRecordDialogProps;
  purgeDialog: PurgeCollectionRecordsDialogProps;
  viewAll: ViewAllRecordsDialogProps;
};

export function buildCollectionRecordsPageViewModel(
  controller: CollectionRecordsControllerValue,
): CollectionRecordsPageViewModel {
  return {
    filters: {
      canUseNicknameFilter: controller.canUseNicknameFilter,
      ...controller.filters,
    },
    toolbar: controller.toolbar,
    table: {
      loadingRecords: controller.table.loadingRecords,
      visibleRecords: controller.table.visibleRecords,
      paginatedRecords: controller.table.paginatedRecords,
      pageOffset: controller.table.pageOffset,
      canEdit: controller.canEdit,
      onViewReceipt: controller.table.onViewReceipt,
      onEdit: controller.table.onEdit,
      onDelete: controller.table.onDelete,
      canDeleteRow: controller.table.canDeleteRow,
    },
    receiptPreview: controller.receiptPreview,
    editDialog: controller.editDialog,
    deleteDialog: controller.deleteDialog,
    purgeDialog: controller.purgeDialog,
    viewAll: {
      open: controller.viewAll.open,
      loading: controller.viewAll.loading,
      fromDate: controller.viewAll.fromDate,
      toDate: controller.viewAll.toDate,
      viewAllRecords: controller.viewAll.records,
      viewAllSummary: controller.viewAll.summary,
      page: controller.viewAll.page,
      pageSize: controller.viewAll.pageSize,
      totalPages: controller.viewAll.totalPages,
      onOpenChange: controller.viewAll.onOpenChange,
      onPageChange: controller.viewAll.onPageChange,
      onPageSizeChange: controller.viewAll.onPageSizeChange,
      onViewReceipt: controller.viewAll.onViewReceipt,
      toDisplayDate: toCollectionDisplayDate,
    },
  };
}
