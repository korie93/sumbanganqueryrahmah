import {
  useCallback,
  useMemo,
} from "react";
import {
  getCollectionRecords,
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
import { useCollectionViewAllRecords } from "@/pages/collection-records/useCollectionViewAllRecords";

type UseCollectionRecordsControllerParams = {
  role: string;
};

const COLLECTION_RECORDS_EXPORT_BATCH_SIZE = 200;

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
    nicknameOptions,
    loadingNicknames,
    page,
    pageSize,
    pageOffset,
    pagedStart,
    pagedEnd,
    totalPages,
    totalRecords,
    totalAmount,
    hasNextPage,
    hasPreviousPage,
    setFromDate,
    setToDate,
    setSearchInput,
    setNicknameFilter,
    buildCurrentFilters,
    loadRecords,
    handleFilter,
    handleResetFilter,
    handlePrevPage,
    handleNextPage,
    handlePageSizeChange,
    getAppliedFilters,
  } = useCollectionRecordsData({ canUseNicknameFilter });
  const { handleViewReceipt, receiptPreview } = useCollectionReceiptPreview();

  const visibleRecords = records;
  const summary = useMemo(
    () => ({
      totalRecords,
      totalAmount,
    }),
    [totalAmount, totalRecords],
  );
  const {
    handleOpenViewAll,
    viewAll,
    viewAllLoading,
  } = useCollectionViewAllRecords({
    buildCurrentFilters,
    searchInput,
  });
  const refreshRecords = useCallback(
    () => loadRecords(getAppliedFilters()),
    [getAppliedFilters, loadRecords],
  );
  const loadExportRecords = useCallback(async () => {
    const appliedFilters = getAppliedFilters();
    if (summary.totalRecords <= 0) {
      return [];
    }

    const allRecords: CollectionRecord[] = [];
    let nextCursor: string | null = null;

    do {
      const response = await getCollectionRecords({
        ...appliedFilters,
        limit: COLLECTION_RECORDS_EXPORT_BATCH_SIZE,
        cursor: nextCursor,
      });
      const pageRecords = Array.isArray(response?.records) ? response.records : [];
      allRecords.push(...pageRecords);
      nextCursor =
        typeof response?.pagination?.nextCursor === "string"
          ? response.pagination.nextCursor
          : typeof response?.nextCursor === "string"
            ? response.nextCursor
            : null;
    } while (nextCursor);

    return allRecords;
  }, [getAppliedFilters, summary.totalRecords]);
  const actions = useCollectionRecordsActions({
    canPurgeOldRecords,
    canUseNicknameFilter,
    fromDate,
    toDate,
    nicknameFilter,
    summary,
    loadExportRecords,
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
    loadingNicknames,
    nicknameOptions,
    onRefresh: refreshAfterMutation,
    onViewReceipt: handleViewReceipt,
  });
  const table = useMemo(
    () =>
      buildCollectionRecordsTableViewModel({
        visibleRecords,
        paginatedRecords: visibleRecords,
        pageOffset,
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
      pageOffset,
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
        pagedStart,
        pagedEnd,
        totalRecords,
        tablePage: page,
        totalPages,
        tablePageSize: pageSize,
        hasNextPage,
        hasPreviousPage,
        onOpenViewAll: () => void handleOpenViewAll(),
        onOpenPurgeDialog: () => void actions.toolbar.onOpenPurgeDialog(),
        onExportExcel: () => void actions.toolbar.onExportExcel(),
        onExportPdf: () => void actions.toolbar.onExportPdf(),
        onTablePageSizeChange: handlePageSizeChange,
        onPrevPage: handlePrevPage,
        onNextPage: handleNextPage,
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
      handleNextPage,
      handleOpenViewAll,
      handlePageSizeChange,
      handlePrevPage,
      hasNextPage,
      hasPreviousPage,
      loadingRecords,
      page,
      pageSize,
      pagedEnd,
      pagedStart,
      totalPages,
      totalRecords,
      summary,
      viewAllLoading,
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
      nicknameOptions,
      loadingNicknames,
      loadingRecords,
      onFromDateChange: setFromDate,
      onToDateChange: setToDate,
      onSearchInputChange: setSearchInput,
      onNicknameFilterChange: setNicknameFilter,
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
