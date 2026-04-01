import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OperationalPage } from "@/components/layout/OperationalPage";
import { usePageShortcuts } from "@/hooks/usePageShortcuts";
import { getImportData } from "@/lib/api";
import { ViewerContent } from "@/pages/viewer/ViewerContent";
import { ViewerPageHeader } from "@/pages/viewer/ViewerPageHeader";
import {
  appendViewerFilter,
  removeViewerFilterAt,
  updateViewerFilterAt,
} from "@/pages/viewer/viewer-filter-state-utils";
import {
  buildViewerActiveFilterChips,
  normalizeViewerPageResult,
  resolveViewerImportName,
} from "@/pages/viewer/page-utils";
import {
  runViewerCsvExport,
  runViewerExcelExport,
  runViewerPdfExport,
} from "@/pages/viewer/viewer-export-actions";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";
import {
  loadViewerPagedExportRows,
  resolveViewerImmediateExportRows,
} from "@/pages/viewer/viewer-export-loader";
import {
  createViewerClearedState,
  createViewerImportResetState,
  createViewerSearchTooShortState,
  deselectViewerColumns,
  getViewerActiveColumnFilters,
  getViewerGridTemplateColumns,
  getViewerPageMetrics,
  getViewerSelectAllFilteredRowIds,
  getViewerVirtualTableMinWidth,
  getViewerVisibleHeaders,
  pruneViewerSelectedRowIds,
  toggleViewerColumnSelection,
  toggleViewerRowSelection,
  type ViewerStatePatch,
} from "@/pages/viewer/viewer-state-utils";
import { extractHeadersFromRows, filterViewerRows } from "@/pages/viewer/utils";

interface ViewerProps {
  onNavigate: (page: string) => void;
  importId?: string;
  userRole: string;
  viewerRowsPerPage?: number;
}

export default function Viewer({
  onNavigate,
  importId,
  userRole,
  viewerRowsPerPage,
}: ViewerProps) {
  // Checked once at mount; low-spec mode is set before the app renders and does not change during a session.
  const isLowSpecMode = useMemo(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("low-spec"),
    [],
  );
  const configuredRowsPerPage = useMemo(() => {
    const parsed = Number(viewerRowsPerPage);
    if (!Number.isFinite(parsed)) return isLowSpecMode ? 40 : 100;
    return Math.min(500, Math.max(10, Math.floor(parsed)));
  }, [isLowSpecMode, viewerRowsPerPage]);
  const isSuperuser = userRole === "superuser";

  const [rows, setRows] = useState<DataRowWithId[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [headersLocked, setHeadersLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [error, setError] = useState("");
  const [importName, setImportName] = useState("Data Viewer");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedColumnFilters, setDebouncedColumnFilters] = useState<ColumnFilter[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [emptyHint, setEmptyHint] = useState("");
  const [isCleared, setIsCleared] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(configuredRowsPerPage);
  const [totalRows, setTotalRows] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageCursorHistory, setPageCursorHistory] = useState<Array<string | null>>([null]);

  const mountedRef = useRef(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<DataRowWithId[]>([]);
  const activeRequestIdRef = useRef(0);
  const exportInFlightRef = useRef<"excel" | "pdf" | null>(null);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const headersLockedRef = useRef(headersLocked);
  const ROWS_PER_PAGE = configuredRowsPerPage;
  const MIN_SEARCH_LENGTH = 2;
  const SEARCH_DEBOUNCE_MS = 300;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestIdRef.current += 1;
      fetchAbortControllerRef.current?.abort();
      fetchAbortControllerRef.current = null;
      exportAbortControllerRef.current?.abort();
      exportAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    headersLockedRef.current = headersLocked;
  }, [headersLocked]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  usePageShortcuts([
    {
      key: "/",
      enabled: rows.length > 0 && !loading,
      handler: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [search]);

  const cancelActiveFetch = useCallback(() => {
    fetchAbortControllerRef.current?.abort();
    fetchAbortControllerRef.current = null;
  }, []);

  const clearSelectionState = useCallback(() => {
    setSelectedRowIds((previous) => (previous.size === 0 ? previous : new Set<number>()));
    setSelectAllFiltered((previous) => (previous ? false : previous));
  }, []);

  const applyViewerStatePatch = useCallback((patch: ViewerStatePatch) => {
    if (patch.rows !== undefined) setRows(patch.rows);
    if (patch.headers !== undefined) setHeaders(patch.headers);
    if (patch.headersLocked !== undefined) {
      setHeadersLocked(patch.headersLocked);
      headersLockedRef.current = patch.headersLocked;
    }
    if (patch.selectedColumns !== undefined) setSelectedColumns(patch.selectedColumns);
    if (patch.columnFilters !== undefined) setColumnFilters(patch.columnFilters);
    if (patch.search !== undefined) setSearch(patch.search);
    if (patch.importName !== undefined) setImportName(patch.importName);
    if (patch.emptyHint !== undefined) setEmptyHint(patch.emptyHint);
    if (patch.isCleared !== undefined) setIsCleared(patch.isCleared);
    if (patch.currentPage !== undefined) setCurrentPage(patch.currentPage);
    if (patch.currentPageSize !== undefined) setCurrentPageSize(patch.currentPageSize);
    if (patch.totalRows !== undefined) setTotalRows(patch.totalRows);
    if (patch.nextCursor !== undefined) setNextCursor(patch.nextCursor);
    if (patch.pageCursorHistory !== undefined) setPageCursorHistory(patch.pageCursorHistory);
    if (patch.loading !== undefined) setLoading(patch.loading);
    if (patch.loadingMore !== undefined) setLoadingMore(patch.loadingMore);
  }, []);

  const fetchData = useCallback(async (
    id: string,
    options?: {
      page?: number;
      cursor?: string | null;
    },
  ) => {
    if (!id) return;
    const targetPage = Math.max(1, options?.page ?? 1);
    const requestCursor = options?.cursor ?? null;

    cancelActiveFetch();
    const requestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;

    if (targetPage === 1 && rowsRef.current.length === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    setError("");

    try {
      const response = await getImportData(id, targetPage, ROWS_PER_PAGE, debouncedSearch, {
        signal: controller.signal,
        cursor: requestCursor || undefined,
        columnFilters: debouncedColumnFilters,
      });
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        requestId !== activeRequestIdRef.current
      ) {
        return;
      }

      const normalizedPage = normalizeViewerPageResult(response ?? {}, targetPage, ROWS_PER_PAGE);

      if (normalizedPage.page === 1 && normalizedPage.rows.length > 0 && !headersLockedRef.current) {
        const detectedHeaders = extractHeadersFromRows(normalizedPage.rows);
        if (detectedHeaders.length > 0) {
          setHeaders(detectedHeaders);
          setSelectedColumns(new Set(detectedHeaders));
          headersLockedRef.current = true;
          setHeadersLocked(true);
        }
      }

      setRows(normalizedPage.rows);
      setCurrentPage(normalizedPage.page);
      setCurrentPageSize(normalizedPage.limit);
      setTotalRows(normalizedPage.total);
      setNextCursor(normalizedPage.nextCursor);
      setPageCursorHistory((previous) => {
        const nextHistory = previous.slice(0, normalizedPage.page - 1);
        nextHistory[normalizedPage.page - 1] = requestCursor;
        return nextHistory;
      });
    } catch (fetchError) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        requestId !== activeRequestIdRef.current
      ) {
        return;
      }

      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch data");
    } finally {
      if (fetchAbortControllerRef.current === controller) {
        fetchAbortControllerRef.current = null;
      }
      if (mountedRef.current && requestId === activeRequestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [ROWS_PER_PAGE, cancelActiveFetch, debouncedColumnFilters, debouncedSearch]);

  useEffect(() => {
    if (importId) {
      cancelActiveFetch();
      applyViewerStatePatch(
        createViewerImportResetState(resolveViewerImportName(), ROWS_PER_PAGE),
      );
      clearSelectionState();
      return;
    }

    cancelActiveFetch();
    activeRequestIdRef.current += 1;
    clearSelectionState();
    applyViewerStatePatch(createViewerClearedState(ROWS_PER_PAGE));
  }, [ROWS_PER_PAGE, applyViewerStatePatch, cancelActiveFetch, clearSelectionState, importId]);

  useEffect(() => {
    clearSelectionState();
  }, [clearSelectionState, columnFilters]);

  useEffect(() => {
    setCurrentPage(1);
    setCurrentPageSize(ROWS_PER_PAGE);
    clearSelectionState();

    if (isCleared || !importId) {
      return;
    }

    if (debouncedSearch && debouncedSearch.length < MIN_SEARCH_LENGTH) {
      cancelActiveFetch();
      activeRequestIdRef.current += 1;
      applyViewerStatePatch(createViewerSearchTooShortState(ROWS_PER_PAGE));
      return;
    }

    setNextCursor(null);
    setPageCursorHistory([null]);
    void fetchData(importId, { page: 1, cursor: null });
  }, [
    ROWS_PER_PAGE,
    applyViewerStatePatch,
    cancelActiveFetch,
    clearSelectionState,
    debouncedColumnFilters,
    debouncedSearch,
    fetchData,
    importId,
    isCleared,
  ]);

  const activeColumnFilters = useMemo(
    () => getViewerActiveColumnFilters(columnFilters),
    [columnFilters],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedColumnFilters(activeColumnFilters);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [SEARCH_DEBOUNCE_MS, activeColumnFilters]);

  const visibleHeaders = useMemo(
    () => getViewerVisibleHeaders(headers, selectedColumns),
    [headers, selectedColumns],
  );
  const isSearchBelowMinLength =
    debouncedSearch.length > 0 && debouncedSearch.length < MIN_SEARCH_LENGTH;
  const isServerSearchActive = debouncedSearch.length >= MIN_SEARCH_LENGTH;
  const filteredRows = useMemo(
    () => filterViewerRows(rows, activeColumnFilters),
    [activeColumnFilters, rows],
  );
  const hasFilteredSubset =
    isServerSearchActive || activeColumnFilters.length > 0 || filteredRows.length !== rows.length;
  const hasPageFilterSubset = filteredRows.length !== rows.length;
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
        totalRows,
        currentPage,
        currentPageSize,
        loadedRowsCount: rows.length,
        nextCursor,
      }),
    [currentPage, currentPageSize, nextCursor, rows.length, totalRows],
  );

  useEffect(() => {
    setSelectedRowIds((previous) => pruneViewerSelectedRowIds(previous, rows));
  }, [rows]);

  const handlePrevPage = useCallback(() => {
    if (!importId || loadingMore || !hasPreviousPage) return;
    clearSelectionState();
    const previousCursor = pageCursorHistory[currentPage - 2] ?? null;
    void fetchData(importId, { page: currentPage - 1, cursor: previousCursor });
  }, [
    clearSelectionState,
    currentPage,
    fetchData,
    hasPreviousPage,
    importId,
    loadingMore,
    pageCursorHistory,
  ]);

  const handleNextPage = useCallback(() => {
    if (!importId || loadingMore || !nextCursor) return;
    clearSelectionState();
    void fetchData(importId, { page: currentPage + 1, cursor: nextCursor });
  }, [clearSelectionState, currentPage, fetchData, importId, loadingMore, nextCursor]);

  const addFilter = useCallback(() => {
    setColumnFilters((previous) => appendViewerFilter(previous, headers));
  }, [headers]);

  const updateFilter = useCallback((index: number, field: keyof ColumnFilter, value: string) => {
    setColumnFilters((previous) => updateViewerFilterAt(previous, index, field, value));
  }, []);

  const removeFilter = useCallback((index: number) => {
    setColumnFilters((previous) => removeViewerFilterAt(previous, index));
  }, []);

  const clearAllFilters = useCallback(() => {
    setColumnFilters([]);
    setSearch("");
    setCurrentPage(1);
  }, []);

  const clearAllData = useCallback(() => {
    cancelActiveFetch();
    exportAbortControllerRef.current?.abort();
    exportAbortControllerRef.current = null;
    activeRequestIdRef.current += 1;
    clearSelectionState();
    applyViewerStatePatch(createViewerClearedState(ROWS_PER_PAGE));
  }, [ROWS_PER_PAGE, applyViewerStatePatch, cancelActiveFetch, clearSelectionState]);

  const toggleColumn = (column: string) => {
    setSelectedColumns((previous) => toggleViewerColumnSelection(previous, column));
  };
  const handleBackToSaved = useCallback(() => onNavigate("saved"), [onNavigate]);
  const handleToggleFilters = useCallback(() => setShowFilters((previous) => !previous), []);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setCurrentPage(1);
  }, []);

  const selectAllColumns = () => {
    setSelectedColumns(new Set(headers));
  };

  const deselectAllColumns = () => {
    setSelectedColumns(deselectViewerColumns(headers));
  };

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

  const loadRowsForExport = useCallback(async (exportFiltered = false, exportSelected = false) => {
    const immediateRows = resolveViewerImmediateExportRows({
      rows,
      filteredRows,
      selectedRowIds,
      exportFiltered,
      exportSelected,
    });

    if (exportSelected || exportFiltered) {
      return immediateRows;
    }

    if (!importId || totalRows <= rows.length) {
      return immediateRows;
    }

    exportAbortControllerRef.current?.abort();
    const controller = new AbortController();
    exportAbortControllerRef.current = controller;

    try {
      return await loadViewerPagedExportRows({
        pageSize: ROWS_PER_PAGE,
        search: debouncedSearch,
        columnFilters: debouncedColumnFilters,
        signal: controller.signal,
        getPage: ({ page, cursor, signal, search, columnFilters }) =>
          getImportData(importId, page, ROWS_PER_PAGE, search, {
            signal,
            cursor,
            columnFilters,
          }),
      });
    } finally {
      if (exportAbortControllerRef.current === controller) {
        exportAbortControllerRef.current = null;
      }
    }
  }, [ROWS_PER_PAGE, debouncedColumnFilters, debouncedSearch, filteredRows, importId, rows, selectedRowIds, totalRows]);

  const activeFilterChips = useMemo(
    () =>
      buildViewerActiveFilterChips({
        search,
        activeColumnFilters,
        onClearSearch: () => handleSearchChange(""),
        onRemoveFilter: removeFilter,
      }),
    [activeColumnFilters, handleSearchChange, removeFilter, search],
  );

  const startPdfExport = useCallback(() => { exportInFlightRef.current = "pdf"; setExportingPdf(true); }, []);
  const finishPdfExport = useCallback(() => { exportInFlightRef.current = null; setExportingPdf(false); }, []);
  const startExcelExport = useCallback(() => { exportInFlightRef.current = "excel"; setExportingExcel(true); }, []);
  const finishExcelExport = useCallback(() => { exportInFlightRef.current = null; setExportingExcel(false); }, []);

  const exportToCSV = async (exportFiltered = false, exportSelected = false) => {
    await runViewerCsvExport({
      headers: visibleHeaders,
      importName,
      exportFiltered,
      exportSelected,
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportingExcel,
      exportingPdf,
      isAnotherExportInFlight: exportInFlightRef.current !== null,
      loadRows: loadRowsForExport,
    });
  };

  const exportToPDF = async (exportFiltered = false, exportSelected = false) => {
    await runViewerPdfExport({
      headers: visibleHeaders,
      importName,
      exportFiltered,
      exportSelected,
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportingExcel,
      exportingPdf,
      isAnotherExportInFlight: exportInFlightRef.current !== null,
      beforeRun: startPdfExport,
      afterRun: finishPdfExport,
      loadRows: loadRowsForExport,
    });
  };

  const exportToExcel = async (exportFiltered = false, exportSelected = false) => {
    await runViewerExcelExport({
      headers: visibleHeaders,
      importName,
      exportFiltered,
      exportSelected,
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportingExcel,
      exportingPdf,
      isAnotherExportInFlight: exportInFlightRef.current !== null,
      beforeRun: startExcelExport,
      afterRun: finishExcelExport,
      loadRows: loadRowsForExport,
    });
  };

  const handleExportCsv = useCallback((exportFiltered = false, exportSelected = false) => {
    void exportToCSV(exportFiltered, exportSelected);
  }, [exportToCSV]);

  const handleExportPdf = useCallback((exportFiltered = false, exportSelected = false) => {
    void exportToPDF(exportFiltered, exportSelected);
  }, [exportToPDF]);

  const handleExportExcel = useCallback((exportFiltered = false, exportSelected = false) => {
    void exportToExcel(exportFiltered, exportSelected);
  }, [exportToExcel]);

  return (
    <OperationalPage width="content">
      <ViewerPageHeader
        importName={importName}
        rowsCount={rows.length}
        totalRows={totalRows}
        currentPage={currentPage}
        totalPages={totalPages}
        headers={headers}
        selectedColumns={selectedColumns}
        showColumnSelector={showColumnSelector}
        showFilters={showFilters}
        filterCount={columnFilters.length}
        isSuperuser={isSuperuser}
        exportBusy={exportingPdf || exportingExcel}
        filteredRowsCount={filteredRows.length}
        selectedRowCount={selectedRowIds.size}
        hasFilteredSubset={hasFilteredSubset}
        onBack={handleBackToSaved}
        onShowColumnSelectorChange={setShowColumnSelector}
        onToggleColumn={toggleColumn}
        onSelectAllColumns={selectAllColumns}
        onDeselectAllColumns={deselectAllColumns}
        onToggleFilters={handleToggleFilters}
        onClearAllData={clearAllData}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        onExportExcel={handleExportExcel}
      />

      <ViewerContent
        rows={rows}
        headers={headers}
        visibleHeaders={visibleHeaders}
        selectedRowIds={selectedRowIds}
        totalRows={totalRows}
        currentPage={currentPage}
        totalPages={totalPages}
        pageStart={pageStart}
        pageEnd={pageEnd}
        showFilters={showFilters}
        columnFilters={columnFilters}
        error={error}
        loading={loading}
        emptyHint={emptyHint}
        isSearchBelowMinLength={isSearchBelowMinLength}
        minSearchLength={MIN_SEARCH_LENGTH}
        search={search}
        filteredRows={filteredRows}
        showResultsSummary={columnFilters.length > 0 || isServerSearchActive}
        activeFilters={activeFilterChips}
        searchInputRef={searchInputRef}
        debouncedSearch={debouncedSearch}
        enableVirtualRows={enableVirtualRows}
        gridTemplateColumns={gridTemplateColumns}
        rowHeightPx={rowHeightPx}
        selectAllFiltered={selectAllFiltered}
        virtualTableMinWidth={virtualTableMinWidth}
        viewportHeightPx={viewportHeightPx}
        hasPageFilterSubset={hasPageFilterSubset}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        loadingMore={loadingMore}
        onBackToSaved={handleBackToSaved}
        onAddFilter={addFilter}
        onClearAllFilters={clearAllFilters}
        onUpdateFilter={updateFilter}
        onRemoveFilter={removeFilter}
        onSearchChange={handleSearchChange}
        onToggleRowSelection={toggleRowSelection}
        onToggleSelectAllFiltered={toggleSelectAllFiltered}
        onClearSelection={clearSelectionState}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
      />
    </OperationalPage>
  );
}
