import type { CollectionRecord } from "@/lib/api";
import type { CollectionRecordsTableProps } from "@/pages/collection-records/CollectionRecordsTable";
import type { CollectionRecordsToolbarProps } from "@/pages/collection-records/CollectionRecordsToolbar";

type BuildCollectionRecordsTableViewModelArgs = {
  visibleRecords: CollectionRecord[];
  paginatedRecords: CollectionRecord[];
  pageOffset: number;
  loadingRecords: boolean;
  canEdit: boolean;
  canDeleteGlobal: boolean;
  onEdit: (record: CollectionRecord) => void;
  onDelete: (record: CollectionRecord) => void;
  onViewReceipt: (record: CollectionRecord) => void;
};

export type CollectionRecordsTableViewModel = CollectionRecordsTableProps;
export type CollectionRecordsToolbarViewModel = CollectionRecordsToolbarProps;

export function buildCollectionRecordsTableViewModel({
  visibleRecords,
  paginatedRecords,
  pageOffset,
  loadingRecords,
  canEdit,
  canDeleteGlobal,
  onEdit,
  onDelete,
  onViewReceipt,
}: BuildCollectionRecordsTableViewModelArgs): CollectionRecordsTableViewModel {
  return {
    visibleRecords,
    paginatedRecords,
    pageOffset,
    loadingRecords,
    canEdit,
    onEdit,
    onDelete,
    onViewReceipt,
    canDeleteRow: (_record: CollectionRecord) => canDeleteGlobal,
  };
}
