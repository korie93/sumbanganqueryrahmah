import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSessionStorage } from "@/lib/browser-storage";
import { usePageShortcuts } from "@/hooks/usePageShortcuts";
import { usePersistentTableDensity } from "@/hooks/usePersistentTableDensity";
import { resolveIsMobileViewport } from "@/hooks/use-mobile";
import { isViewerPageSizeChoice, resolveInitialViewerPageSize } from "@/pages/viewer/viewer-page-size";
import {
  consumeViewerAnalysisHandoff,
} from "@/pages/viewer/analysis-handoff";
import { buildViewerActiveFilterChips } from "@/pages/viewer/page-utils";
import { useViewerDataState } from "@/pages/viewer/useViewerDataState";
import { useViewerExportState } from "@/pages/viewer/useViewerExportState";
import { getViewerTableLayout } from "@/pages/viewer/viewer-column-presentation";
import { getViewerViewportHeight } from "@/pages/viewer/viewer-viewport-utils";
import { resolveViewerPinnedColumn } from "@/pages/viewer/viewer-pinned-column";
import {
  createViewerColumnResetUndo,
  restoreViewerColumnResetUndo,
  type ViewerColumnResetUndoSnapshot,
} from "@/pages/viewer/viewer-column-reset-undo";
import { filterViewerServerPageRows } from "@/pages/viewer/utils";
import { useViewerFilterPresets } from "@/pages/viewer/useViewerFilterPresets";
import {
  buildViewerHeadersSignature,
  moveViewerColumn,
  readViewerColumnPreference,
  writeViewerColumnPreference,
} from "@/pages/viewer/viewer-column-preferences";
import {
  deselectViewerColumns,
  getViewerPageMetrics,
  getViewerSelectAllFilteredRowIds,
  getViewerVisibleHeaders,
  pruneViewerSelectedRowIds,
  resolveViewerFilterRowIndex,
  toggleViewerColumnSelection,
  toggleViewerRowSelection,
} from "@/pages/viewer/viewer-state-utils";

type ViewerPageStateOptions = {
  onNavigate: (page: string) => void;
  importId?: string | undefined;
  accountId?: string | undefined;
  userRole: string;
  viewerRowsPerPage?: number | undefined;
};

export function useViewerPageState({
  onNavigate,
  importId,
  accountId,
  userRole,
  viewerRowsPerPage,
}: ViewerPageStateOptions) {
  const isLowSpecMode = useMemo(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("low-spec"),
    [],
  );
  // Capture layout only when Viewer opens. Desktop config can arrive later;
  // respect it until an explicit choice, without making size depend on resize.
  const [initialCardLayout] = useState(() =>
    resolveIsMobileViewport(typeof window === "undefined" ? undefined : window),
  );
  const [pageSizeOverride, setRowsPerPage] = useState<number | null>(null);
  const rowsPerPage = pageSizeOverride ?? resolveInitialViewerPageSize(viewerRowsPerPage, initialCardLayout, isLowSpecMode);
  const isSuperuser = userRole === "superuser";
  const tableDensity = usePersistentTableDensity("viewer");

  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  // Pinning is a desktop presentation choice for the open dataset, not stored data/order.
  const [pinnedColumnChoice, setPinnedColumnChoice] = useState<{ key: string; column: string } | null>(null);
  const [columnResetUndo, setColumnResetUndo] = useState<{ key: string; snapshot: ViewerColumnResetUndoSnapshot } | null>(null);
  const [columnPreferencesReady, setColumnPreferencesReady] = useState(false);
  const [columnPreferencesDirty, setColumnPreferencesDirty] = useState(false);
  const initializedColumnPreferenceKeyRef = useRef("");
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [analysisHandoff] = useState(() =>
    consumeViewerAnalysisHandoff(getBrowserSessionStorage()),
  );

  const clearSelectionState = useCallback(() => {
    setSelectedRowIds((previous) => (previous.size === 0 ? previous : new Set<number>()));
    setSelectAllFiltered((previous) => (previous ? false : previous));
  }, []);

  const data = useViewerDataState({
    importId,
    initialSearch: analysisHandoff?.search,
    rowsPerPage,
    onSelectionReset: clearSelectionState,
  });
  const presetState = useViewerFilterPresets({ accountId, importId, enabled: showFilters && data.headers.length > 0 });

  const columnPreferenceKey = useMemo(
    () => `${importId || "default"}::${buildViewerHeadersSignature(data.headers)}`,
    [data.headers, importId],
  );

  useEffect(() => {
    if (data.headers.length === 0) {
      setSelectedColumns((previous) => (previous.size === 0 ? previous : new Set<string>()));
      setColumnOrder((previous) => (previous.length === 0 ? previous : []));
      setPinnedColumnChoice(null);
      setColumnResetUndo(null);
      setColumnPreferencesReady(false);
      setColumnPreferencesDirty(false);
      initializedColumnPreferenceKeyRef.current = "";
      return;
    }

    if (initializedColumnPreferenceKeyRef.current === columnPreferenceKey) {
      return;
    }

    const preference = readViewerColumnPreference(importId, data.headers);
    initializedColumnPreferenceKeyRef.current = columnPreferenceKey;
    setPinnedColumnChoice(null);
    setColumnResetUndo(null);
    setColumnOrder(preference.order);
    setSelectedColumns(
      analysisHandoff?.focusColumn && data.headers.includes(analysisHandoff.focusColumn)
        ? new Set([analysisHandoff.focusColumn])
        : new Set(preference.visible),
    );
    setColumnPreferencesReady(true);
    setColumnPreferencesDirty(false);
  }, [analysisHandoff?.focusColumn, columnPreferenceKey, data.headers, importId]);

  useEffect(() => {
    if (
      !columnPreferencesReady
      || !columnPreferencesDirty
      || columnOrder.length === 0
      || selectedColumns.size === 0
    ) {
      return;
    }

    writeViewerColumnPreference(importId, {
      order: columnOrder,
      visible: columnOrder.filter((column) => selectedColumns.has(column)),
    });
    setColumnPreferencesDirty(false);
  }, [
    columnOrder,
    columnPreferencesDirty,
    columnPreferencesReady,
    importId,
    selectedColumns,
  ]);

  usePageShortcuts([
    {
      key: "/",
      enabled: data.headers.length > 0,
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

  const orderedHeaders = useMemo(
    () => (columnOrder.length > 0 ? columnOrder : data.headers),
    [columnOrder, data.headers],
  );
  const visibleHeaders = useMemo(
    () => getViewerVisibleHeaders(orderedHeaders, selectedColumns),
    [orderedHeaders, selectedColumns],
  );
  const pinnedColumn = pinnedColumnChoice?.key === columnPreferenceKey
    ? resolveViewerPinnedColumn(pinnedColumnChoice.column, visibleHeaders)
    : null;
  useEffect(() => {
    // A hidden or removed column must not silently become pinned when shown again.
    if (pinnedColumnChoice && pinnedColumn === null) setPinnedColumnChoice(null);
  }, [pinnedColumn, pinnedColumnChoice]);
  const togglePinnedColumn = useCallback((column: string) => {
    if (!data.headers.includes(column) || resolveViewerPinnedColumn(column, visibleHeaders) === null) return;
    setColumnResetUndo(null);
    setPinnedColumnChoice((previous) => previous?.key === columnPreferenceKey && previous.column === column
      ? null : { key: columnPreferenceKey, column });
  }, [columnPreferenceKey, data.headers, visibleHeaders]);
  const isSearchBelowMinLength =
    data.debouncedSearch.length > 0 && data.debouncedSearch.length < data.minSearchLength;
  const isServerSearchActive = data.debouncedSearch.length >= data.minSearchLength;
  const filteredRows = useMemo(
    () => filterViewerServerPageRows(data.rows, data.activeColumnFilters),
    [data.activeColumnFilters, data.rows],
  );
  const hasFilteredSubset =
    isServerSearchActive
    || data.activeColumnFilters.length > 0
    || filteredRows.length !== data.rows.length;
  const hasPageFilterSubset = filteredRows.length !== data.rows.length;
  const enableVirtualRows = filteredRows.length > (isLowSpecMode ? 60 : 120);
  const rowHeightPx = tableDensity.density === "compact" ? 40 : 48;
  const [viewportHeightPx, setViewportHeightPx] = useState(() =>
    getViewerViewportHeight(typeof window === "undefined" ? 900 : window.innerHeight),
  );
  useEffect(() => {
    const updateViewport = () => setViewportHeightPx(getViewerViewportHeight(window.innerHeight));
    window.addEventListener("resize", updateViewport, { passive: true });
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  const { minWidth: virtualTableMinWidth, gridTemplateColumns } = useMemo(
    () => getViewerTableLayout(visibleHeaders, tableDensity.density),
    [tableDensity.density, visibleHeaders],
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
    if (!data.headers.includes(column) || (selectedColumns.has(column) && selectedColumns.size === 1)) return;
    setColumnResetUndo(null);
    setSelectedColumns((previous) => toggleViewerColumnSelection(previous, column));
    setColumnPreferencesDirty(true);
  }, [data.headers, selectedColumns]);

  const selectAllColumns = useCallback(() => {
    if (selectedColumns.size === data.headers.length && data.headers.every((column) => selectedColumns.has(column))) return;
    setColumnResetUndo(null);
    setSelectedColumns(new Set(data.headers));
    setColumnPreferencesDirty(true);
  }, [data.headers, selectedColumns]);

  const deselectAllColumns = useCallback(() => {
    const nextColumns = deselectViewerColumns(orderedHeaders);
    if (pinnedColumn === null && nextColumns.size === selectedColumns.size
      && [...nextColumns].every((column) => selectedColumns.has(column))) return;
    setColumnResetUndo(null);
    setPinnedColumnChoice(null);
    setSelectedColumns(nextColumns);
    setColumnPreferencesDirty(true);
  }, [orderedHeaders, pinnedColumn, selectedColumns]);

  const moveColumn = useCallback((column: string, direction: -1 | 1) => {
    const nextOrder = moveViewerColumn(orderedHeaders, column, direction);
    if (nextOrder === orderedHeaders) return;
    setColumnResetUndo(null);
    setColumnOrder(nextOrder);
    setColumnPreferencesDirty(true);
  }, [orderedHeaders]);

  const resetColumns = useCallback(() => {
    const snapshot = createViewerColumnResetUndo(data.headers, orderedHeaders, selectedColumns, pinnedColumn);
    // Repeated Reset must retain the useful restore point instead of capturing defaults.
    if (!snapshot) return;
    setColumnResetUndo({ key: columnPreferenceKey, snapshot });
    setPinnedColumnChoice(null);
    setColumnOrder([...data.headers]);
    setSelectedColumns(new Set(data.headers));
    setColumnPreferencesDirty(true);
  }, [columnPreferenceKey, data.headers, orderedHeaders, pinnedColumn, selectedColumns]);

  const canUndoColumnReset = columnResetUndo?.key === columnPreferenceKey && data.headers.length > 0;
  const undoColumnReset = useCallback(() => {
    if (!columnResetUndo || columnResetUndo.key !== columnPreferenceKey) return;
    const restored = restoreViewerColumnResetUndo(columnResetUndo.snapshot, data.headers);
    setColumnResetUndo(null);
    if (!restored) return;
    setColumnOrder(restored.order);
    setSelectedColumns(new Set(restored.visible));
    setPinnedColumnChoice(restored.pinnedColumn === null ? null
      : { key: columnPreferenceKey, column: restored.pinnedColumn });
    setColumnPreferencesDirty(true);
  }, [columnPreferenceKey, columnResetUndo, data.headers]);

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
    canExport: data.canExport,
    // Keep the existing export batch size instead of multiplying server reads
    // when the person chooses fewer cards per page.
    rowsPerPage: resolveInitialViewerPageSize(viewerRowsPerPage, false, isLowSpecMode),
    importId,
    importName: data.importName,
    rows: data.rows,
    filteredRows,
    visibleHeaders,
    selectedRowIds,
    totalRows: data.totalRows,
    debouncedSearch: data.debouncedSearch,
    debouncedColumnFilters: data.debouncedColumnFilters,
    numericSort: data.numericSort,
  });

  const pageSizeDisabled = data.loading || data.loadingMore || exportState.exportBusy;
  const handleRowsPerPageChange = useCallback((nextSize: number) => {
    if (pageSizeDisabled || nextSize === rowsPerPage || !isViewerPageSizeChoice(nextSize)) return;
    clearSelectionState();
    setRowsPerPage(nextSize);
  }, [clearSelectionState, pageSizeDisabled, rowsPerPage]);

  const clearAllData = useCallback(() => {
    exportState.cancelActiveExport();
    data.clearAllData();
    setColumnResetUndo(null);
    setSelectedColumns(new Set<string>());
    setPinnedColumnChoice(null);
  }, [data.clearAllData, exportState.cancelActiveExport]);

  const handleClearSearchFilter = useCallback(() => {
    data.handleSearchChange("");
  }, [data.handleSearchChange]);

  const handleRemoveActiveFilter = useCallback((index: number) => {
    const filter = data.activeColumnFilters[index];
    if (!filter) return;
    const rowIndex = resolveViewerFilterRowIndex(data.columnFilters, filter);
    if (rowIndex >= 0) data.removeFilter(rowIndex);
  }, [data.activeColumnFilters, data.columnFilters, data.removeFilter]);

  const handleClearNumericSort = useCallback(() => {
    data.handleNumericSortChange(null);
  }, [data.handleNumericSortChange]);

  const activeFilterChips = useMemo(
    () =>
      buildViewerActiveFilterChips({
        search: data.search,
        activeColumnFilters: data.activeColumnFilters,
        onClearSearch: handleClearSearchFilter,
        onRemoveFilter: handleRemoveActiveFilter,
        numericSort: data.numericSort,
        onClearNumericSort: handleClearNumericSort,
      }),
    [data.activeColumnFilters, data.search, data.numericSort, handleClearSearchFilter, handleRemoveActiveFilter, handleClearNumericSort],
  );

  return {
    isSuperuser,
    importName: data.importName,
    rows: data.rows,
    headers: orderedHeaders,
    totalRows: data.totalRows,
    currentPage: data.currentPage,
    totalPages,
    rowsPerPage,
    pageSizeDisabled,
    handleRowsPerPageChange,
    selectedColumns,
    pinnedColumn,
    togglePinnedColumn,
    canUndoColumnReset,
    undoColumnReset,
    showColumnSelector,
    setShowColumnSelector,
    showFilters,
    columnFilters: data.columnFilters,
    numericSort: data.numericSort,
    handleNumericSortChange: data.handleNumericSortChange,
    presetState,
    applyFilterPreset: data.applyFilterPreset,
    exportingExcel: exportState.exportingExcel,
    exportingPdf: exportState.exportingPdf,
    exportBusy: exportState.exportBusy,
    exportStatus: exportState.exportStatus,
    cancelActiveExport: exportState.cancelActiveExport,
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
    canRetry: data.canRetry,
    retrying: data.retrying,
    handleRetry: data.handleRetry,
    exportReady: data.exportReady,
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
    tableDensity: tableDensity.density,
    tableDensityPreference: tableDensity.preference,
    setTableDensityPreference: tableDensity.setPreference,
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
    moveColumn,
    resetColumns,
    selectAllColumns,
    deselectAllColumns,
    isServerSearchActive,
  };
}
