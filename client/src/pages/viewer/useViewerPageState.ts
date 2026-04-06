import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageShortcuts } from "@/hooks/usePageShortcuts";
import { buildViewerActiveFilterChips } from "@/pages/viewer/page-utils";
import { useViewerDataState } from "@/pages/viewer/useViewerDataState";
import { useViewerExportState } from "@/pages/viewer/useViewerExportState";
import { filterViewerRows } from "@/pages/viewer/utils";
import {
  deselectViewerColumns,
  getViewerGridTemplateColumns,
  getViewerPageMetrics,
  getViewerSelectAllFilteredRowIds,
  getViewerVirtualTableMinWidth,
  getViewerVisibleHeaders,
  pruneViewerSelectedRowIds,
  toggleViewerColumnSelection,
  toggleViewerRowSelection,
} from "@/pages/viewer/viewer-state-utils";

type ViewerPageStateOptions = {
  onNavigate: (page: string) => void;
  importId?: string;
  userRole: string;
  viewerRowsPerPage?: number;
};

export function useViewerPageState({
  onNavigate,
  importId,
  userRole,
  viewerRowsPerPage,
}: ViewerPageStateOptions) {
  const isLowSpecMode = useMemo(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("low-spec"),
    [],
  );
  const rowsPerPage = useMemo(() => {
    const parsed = Number(viewerRowsPerPage);
    if (!Number.isFinite(parsed)) return isLowSpecMode ? 40 : 100;
    return Math.min(500, Math.max(10, Math.floor(parsed)));
  }, [isLowSpecMode, viewerRowsPerPage]);
  const isSuperuser = userRole === "superuser";

  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);

  const clearSelectionState = useCallback(() => {
    setSelectedRowIds((previous) => (previous.size === 0 ? previous : new Set<number>()));
    setSelectAllFiltered((previous) => (previous ? false : previous));
  }, []);

  const data = useViewerDataState({
    importId,
    rowsPerPage,
    onSelectionReset: clearSelectionState,
  });

  useEffect(() => {
    if (data.headers.length === 0) {
      setSelectedColumns((previous) => (previous.size === 0 ? previous : new Set<string>()));
      return;
    }

    setSelectedColumns((previous) => {
      if (previous.size > 0) {
        return previous;
      }

      return new Set(data.headers);
    });
  }, [data.headers]);

  usePageShortcuts([
    {
      key: "/",
      enabled: data.rows.length > 0 && !data.loading,
      handler: () => {
        data.searchInputRef.current?.focus();
        data.searchInputRef.current?.select();
      },
    },
    {
      key: "Escape",
      enabled: showFilters || showColumnSelector,
      preventDefault: false,
      handler: () => {
        setShowFilters(false);
        setShowColumnSelector(false);
      },
    },
  ]);

  const visibleHeaders = useMemo(
    () => getViewerVisibleHeaders(data.headers, selectedColumns),
    [data.headers, selectedColumns],
  );
  const isSearchBelowMinLength =
    data.debouncedSearch.length > 0 && data.debouncedSearch.length < data.minSearchLength;
  const isServerSearchActive = data.debouncedSearch.length >= data.minSearchLength;
  const filteredRows = useMemo(
    () => filterViewerRows(data.rows, data.activeColumnFilters),
    [data.activeColumnFilters, data.rows],
  );
  const hasFilteredSubset =
    isServerSearchActive
    || data.activeColumnFilters.length > 0
    || filteredRows.length !== data.rows.length;
  const hasPageFilterSubset = filteredRows.length !== data.rows.length;
  const enableVirtualRows = filteredRows.length > (isLowSpecMode ? 60 : 120);
  const rowHeightPx = 48;
  const viewportHeightPx = 520;
  const virtualTableMinWidth = useMemo(
    () => getViewerVirtualTableMinWidth(visibleHeaders.length),
    [visibleHeaders.length],
  );
  const gridTemplateColumns = useMemo(
    () => getViewerGridTemplateColumns(visibleHeaders.length),
    [visibleHeaders.length],
  );
  const { totalPages, pageStart, pageEnd, hasPreviousPage, hasNextPage } = useMemo(
    () =>
      getViewerPageMetrics({
        totalRows: data.totalRows,
        currentPage: data.currentPage,
        currentPageSize: data.currentPageSize,
        loadedRowsCount: data.rows.length,
        nextCursor: data.nextCursor,
      }),
    [data.currentPage, data.currentPageSize, data.nextCursor, data.rows.length, data.totalRows],
  );

  useEffect(() => {
    setSelectedRowIds((previous) => pruneViewerSelectedRowIds(previous, data.rows));
  }, [data.rows]);

  const handleBackToSaved = useCallback(() => onNavigate("saved"), [onNavigate]);
  const handleToggleFilters = useCallback(() => setShowFilters((previous) => !previous), []);
  const handleShowFiltersChange = useCallback((open: boolean) => {
    setShowFilters(open);
  }, []);

  const toggleColumn = useCallback((column: string) => {
    setSelectedColumns((previous) => toggleViewerColumnSelection(previous, column));
  }, []);

  const selectAllColumns = useCallback(() => {
    setSelectedColumns(new Set(data.headers));
  }, [data.headers]);

  const deselectAllColumns = useCallback(() => {
    setSelectedColumns(deselectViewerColumns(data.headers));
  }, [data.headers]);

  const toggleRowSelection = useCallback((rowId: number) => {
    setSelectedRowIds((previous) => toggleViewerRowSelection(previous, rowId));
    setSelectAllFiltered(false);
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    if (selectAllFiltered) {
      setSelectedRowIds(new Set());
      setSelectAllFiltered(false);
      return;
    }

    setSelectedRowIds(getViewerSelectAllFilteredRowIds(filteredRows));
    setSelectAllFiltered(true);
  }, [filteredRows, selectAllFiltered]);

  const exportState = useViewerExportState({
    rowsPerPage,
    importId,
    importName: data.importName,
    rows: data.rows,
    filteredRows,
    visibleHeaders,
    selectedRowIds,
    totalRows: data.totalRows,
    debouncedSearch: data.debouncedSearch,
    debouncedColumnFilters: data.debouncedColumnFilters,
  });

  const clearAllData = useCallback(() => {
    exportState.cancelActiveExport();
    data.clearAllData();
    setSelectedColumns(new Set<string>());
  }, [data, exportState]);

  const activeFilterChips = useMemo(
    () =>
      buildViewerActiveFilterChips({
        search: data.search,
        activeColumnFilters: data.activeColumnFilters,
        onClearSearch: () => data.handleSearchChange(""),
        onRemoveFilter: data.removeFilter,
      }),
    [data.activeColumnFilters, data.handleSearchChange, data.removeFilter, data.search],
  );

  return {
    isSuperuser,
    importName: data.importName,
    rows: data.rows,
    headers: data.headers,
    totalRows: data.totalRows,
    currentPage: data.currentPage,
    totalPages,
    selectedColumns,
    showColumnSelector,
    setShowColumnSelector,
    showFilters,
    columnFilters: data.columnFilters,
    exportingExcel: exportState.exportingExcel,
    exportingPdf: exportState.exportingPdf,
    filteredRows,
    selectedRowIds,
    hasFilteredSubset,
    handleBackToSaved,
    handleToggleFilters,
    clearAllData,
    handleExportCsv: exportState.handleExportCsv,
    handleExportPdf: exportState.handleExportPdf,
    handleExportExcel: exportState.handleExportExcel,
    visibleHeaders,
    pageStart,
    pageEnd,
    error: data.error,
    loading: data.loading,
    emptyHint: data.emptyHint,
    isSearchBelowMinLength,
    MIN_SEARCH_LENGTH: data.minSearchLength,
    search: data.search,
    activeFilterChips,
    searchInputRef: data.searchInputRef,
    debouncedSearch: data.debouncedSearch,
    enableVirtualRows,
    gridTemplateColumns,
    rowHeightPx,
    selectAllFiltered,
    virtualTableMinWidth,
    viewportHeightPx,
    hasPageFilterSubset,
    hasNextPage,
    hasPreviousPage,
    loadingMore: data.loadingMore,
    addFilter: data.addFilter,
    clearAllFilters: data.clearAllFilters,
    updateFilter: data.updateFilter,
    removeFilter: data.removeFilter,
    handleSearchChange: data.handleSearchChange,
    toggleRowSelection,
    toggleSelectAllFiltered,
    clearSelectionState,
    handlePrevPage: data.handlePrevPage,
    handleNextPage: data.handleNextPage,
    handleShowFiltersChange,
    toggleColumn,
    selectAllColumns,
    deselectAllColumns,
    isServerSearchActive,
  };
}
