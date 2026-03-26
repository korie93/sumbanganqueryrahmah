import {
  useCallback,
  useMemo,
} from "react";
import {
  type CollectionRecord,
} from "@/lib/api";
import {
  buildCollectionRecordsTableViewModel,
  buildCollectionRecordsToolbarViewModel,
} from "@/pages/collection-records/collection-records-view-models";
import { useCollectionRecordsActions } from "@/pages/collection-records/useCollectionRecordsActions";
import { useCollectionRecordEdit } from "@/pages/collection-records/useCollectionRecordEdit";
import { useCollectionRecordsData } from "@/pages/collection-records/useCollectionRecordsData";
import { useCollectionReceiptPreview } from "@/pages/collection-records/useCollectionReceiptPreview";
import { useCollectionRecordsTableState } from "@/pages/collection-records/useCollectionRecordsTableState";
import { useCollectionViewAllRecords } from "@/pages/collection-records/useCollectionViewAllRecords";
import { computeSummary } from "@/pages/collection/utils";

type UseCollectionRecordsControllerParams = {
  role: string;
};

export function useCollectionRecordsController({
  role,
}: UseCollectionRecordsControllerParams) {
  const canEdit = role === "user" || role === "admin" || role === "superuser";
  const canDeleteGlobal = role === "admin" || role === "superuser" || role === "user";
  const canUseNicknameFilter = role === "admin" || role === "superuser";
  const canPurgeOldRecords = role === "superuser";

  const {
    records,
    loadingRecords,
    fromDate,
    toDate,
    searchInput,
    nicknameFilter,
    reviewFilter,
    duplicateFilter,
    nicknameOptions,
    loadingNicknames,
    setFromDate,
    setToDate,
    setSearchInput,
    setNicknameFilter,
    setReviewFilter,
    setDuplicateFilter,
    buildCurrentFilters,
    loadRecords,
    handleFilter,
    handleResetFilter,
  } = useCollectionRecordsData({ canUseNicknameFilter });
  const { handleViewReceipt, receiptPreview } = useCollectionReceiptPreview();

  const visibleRecords = records;
  const summary = useMemo(() => computeSummary(records), [records]);
  const tableState = useCollectionRecordsTableState({
    visibleRecords,
    resetKey: [fromDate, toDate, searchInput, nicknameFilter, reviewFilter, duplicateFilter].join("|"),
  });
  const {
    handleOpenViewAll,
    viewAll,
    viewAllLoading,
  } = useCollectionViewAllRecords({
    buildCurrentFilters,
    searchInput,
  });
  const refreshRecords = useCallback(
    () => loadRecords(buildCurrentFilters()),
    [buildCurrentFilters, loadRecords],
  );
  const actions = useCollectionRecordsActions({
    canPurgeOldRecords,
    canUseNicknameFilter,
    fromDate,
    toDate,
    nicknameFilter,
    visibleRecords,
    summary,
    onRefreshRecords: refreshRecords,
  });
  const refreshAfterMutation = useCallback(
    async () =>
      Promise.all([
        refreshRecords(),
        actions.refreshPurgeSummary(),
      ]),
    [actions, refreshRecords],
  );
  const { editDialog, openEditDialog } = useCollectionRecordEdit({
    role,
    loadingNicknames,
    nicknameOptions,
    onRefresh: refreshAfterMutation,
    onViewReceipt: handleViewReceipt,
  });
  const table = useMemo(
    () =>
      buildCollectionRecordsTableViewModel({
        visibleRecords,
        paginatedRecords: tableState.paginatedRecords,
        pageOffset: tableState.pageOffset,
        loadingRecords,
        canEdit,
        canDeleteGlobal,
        onEdit: openEditDialog,
        onDelete: actions.requestDelete,
        onViewReceipt: (record: CollectionRecord) => void handleViewReceipt(record),
      }),
    [
      actions.requestDelete,
      canEdit,
      canDeleteGlobal,
      handleViewReceipt,
      loadingRecords,
      openEditDialog,
      tableState.pageOffset,
      tableState.paginatedRecords,
      visibleRecords,
    ],
  );
  const toolbar = useMemo(
    () =>
      buildCollectionRecordsToolbarViewModel({
        summary,
        loadingRecords,
        viewAllLoading,
        exportingExcel: actions.toolbar.exportingExcel,
        exportingPdf: actions.toolbar.exportingPdf,
        canPurgeOldRecords,
        purgeSummaryLoading: actions.toolbar.purgeSummaryLoading,
        purgingOldRecords: actions.toolbar.purgingOldRecords,
        purgeSummary: actions.toolbar.purgeSummary,
        pagedStart: tableState.pagedStart,
        pagedEnd: tableState.pagedEnd,
        visibleRecordsLength: visibleRecords.length,
        tablePage: tableState.tablePage,
        totalPages: tableState.totalPages,
        tablePageSize: tableState.tablePageSize,
        onOpenViewAll: () => void handleOpenViewAll(),
        onOpenPurgeDialog: () => void actions.toolbar.onOpenPurgeDialog(),
        onExportExcel: () => void actions.toolbar.onExportExcel(),
        onExportPdf: () => void actions.toolbar.onExportPdf(),
        onTablePageSizeChange: tableState.setTablePageSize,
        onPrevPage: tableState.handlePrevPage,
        onNextPage: tableState.handleNextPage,
      }),
    [
      actions.toolbar.exportingExcel,
      actions.toolbar.exportingPdf,
      actions.toolbar.onExportExcel,
      actions.toolbar.onExportPdf,
      actions.toolbar.onOpenPurgeDialog,
      actions.toolbar.purgeSummary,
      actions.toolbar.purgeSummaryLoading,
      actions.toolbar.purgingOldRecords,
      canPurgeOldRecords,
      handleOpenViewAll,
      loadingRecords,
      summary,
      tableState.handleNextPage,
      tableState.handlePrevPage,
      tableState.pagedEnd,
      tableState.pagedStart,
      tableState.setTablePageSize,
      tableState.tablePage,
      tableState.tablePageSize,
      tableState.totalPages,
      viewAllLoading,
      visibleRecords.length,
    ],
  );

  return {
    canEdit,
    canDeleteGlobal,
    canUseNicknameFilter,
    canPurgeOldRecords,
    filters: {
      fromDate,
      toDate,
      searchInput,
      nicknameFilter,
      reviewFilter,
      duplicateFilter,
      nicknameOptions,
      loadingNicknames,
      loadingRecords,
      onFromDateChange: setFromDate,
      onToDateChange: setToDate,
      onSearchInputChange: setSearchInput,
      onNicknameFilterChange: setNicknameFilter,
      onReviewFilterChange: setReviewFilter,
      onDuplicateFilterChange: setDuplicateFilter,
      onFilter: () => void handleFilter(),
      onReset: () => void handleResetFilter(),
    },
    table,
    toolbar,
    receiptPreview: {
      ...receiptPreview,
    },
    editDialog: {
      ...editDialog,
    },
    deleteDialog: actions.deleteDialog,
    purgeDialog: actions.purgeDialog,
    viewAll: {
      ...viewAll,
      onViewReceipt: (record: CollectionRecord) => void handleViewReceipt(record),
    },
  };
}

export type CollectionRecordsControllerValue = ReturnType<
  typeof useCollectionRecordsController
>;
