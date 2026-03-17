import type { CollectionRecord } from "@/lib/api";
import type { CollectionRecordsTableProps } from "@/pages/collection-records/CollectionRecordsTable";
import type { CollectionRecordsToolbarProps } from "@/pages/collection-records/CollectionRecordsToolbar";

type Summary = {
  totalRecords: number;
  totalAmount: number;
};

type PurgeSummary = {
  cutoffDate: string;
  eligibleRecords: number;
  totalAmount: number;
} | null;

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

type BuildCollectionRecordsToolbarViewModelArgs = {
  summary: Summary;
  loadingRecords: boolean;
  viewAllLoading: boolean;
  exportingExcel: boolean;
  exportingPdf: boolean;
  canPurgeOldRecords: boolean;
  purgeSummaryLoading: boolean;
  purgingOldRecords: boolean;
  purgeSummary: PurgeSummary;
  pagedStart: number;
  pagedEnd: number;
  visibleRecordsLength: number;
  tablePage: number;
  totalPages: number;
  tablePageSize: number;
  onOpenViewAll: () => void;
  onOpenPurgeDialog: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onTablePageSizeChange: (value: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
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

export function buildCollectionRecordsToolbarViewModel({
  summary,
  loadingRecords,
  viewAllLoading,
  exportingExcel,
  exportingPdf,
  canPurgeOldRecords,
  purgeSummaryLoading,
  purgingOldRecords,
  purgeSummary,
  pagedStart,
  pagedEnd,
  visibleRecordsLength,
  tablePage,
  totalPages,
  tablePageSize,
  onOpenViewAll,
  onOpenPurgeDialog,
  onExportExcel,
  onExportPdf,
  onTablePageSizeChange,
  onPrevPage,
  onNextPage,
}: BuildCollectionRecordsToolbarViewModelArgs): CollectionRecordsToolbarViewModel {
  return {
    summary,
    loadingRecords,
    viewAllLoading,
    exportingExcel,
    exportingPdf,
    canPurgeOldRecords,
    purgeSummaryLoading,
    purgingOldRecords,
    purgeSummary,
    pagedStart,
    pagedEnd,
    visibleRecordsLength,
    tablePage,
    totalPages,
    tablePageSize,
    onOpenViewAll,
    onOpenPurgeDialog,
    onExportExcel,
    onExportPdf,
    onTablePageSizeChange,
    onPrevPage,
    onNextPage,
  };
}
