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
import { filterViewerRows } from "@/pages/viewer/utils";
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
  toggleViewerColumnSelection,
  toggleViewerRowSelection,
} from "@/pages/viewer/viewer-state-utils";

type ViewerPageStateOptions = {
  onNavigate: (page: string) => void;
  importId?: string | undefined;
  userRole: string;
  viewerRowsPerPage?: number | undefined;
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

  const columnPreferenceKey = useMemo(
    () => `${importId || "default"}::${buildViewerHeadersSignature(data.headers)}`,
    [data.headers, importId],
  );

  useEffect(() => {
    if (data.headers.length === 0) {
      setSelectedColumns((previous) => (previous.size === 0 ? previous : new Set<string>()));
      setColumnOrder((previous) => (previous.length === 0 ? previous : []));
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
    setSelectedColumns((previous) => toggleViewerColumnSelection(previous, column));
    setColumnPreferencesDirty(true);
  }, []);

  const selectAllColumns = useCallback(() => {
    setSelectedColumns(new Set(data.headers));
    setColumnPreferencesDirty(true);
  }, [data.headers]);

  const deselectAllColumns = useCallback(() => {
    setSelectedColumns(deselectViewerColumns(orderedHeaders));
    setColumnPreferencesDirty(true);
  }, [orderedHeaders]);

  const moveColumn = useCallback((column: string, direction: -1 | 1) => {
    setColumnOrder((previous) => moveViewerColumn(previous, column, direction));
    setColumnPreferencesDirty(true);
  }, []);

  const resetColumns = useCallback(() => {
    setColumnOrder([...data.headers]);
    setSelectedColumns(new Set(data.headers));
    setColumnPreferencesDirty(true);
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
    setSelectedColumns(new Set<string>());
  }, [data.clearAllData, exportState.cancelActiveExport]);

  const handleClearSearchFilter = useCallback(() => {
    data.handleSearchChange("");
  }, [data.handleSearchChange]);

  const activeFilterChips = useMemo(
    () =>
      buildViewerActiveFilterChips({
        search: data.search,
        activeColumnFilters: data.activeColumnFilters,
        onClearSearch: handleClearSearchFilter,
        onRemoveFilter: data.removeFilter,
      }),
    [data.activeColumnFilters, data.removeFilter, data.search, handleClearSearchFilter],
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
    showColumnSelector,
    setShowColumnSelector,
    showFilters,
    columnFilters: data.columnFilters,
    exportingExcel: exportState.exportingExcel,
    exportingPdf: exportState.exportingPdf,
    exportBusy: exportState.exportBusy,
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
