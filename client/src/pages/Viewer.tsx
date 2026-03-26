import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Eye } from "lucide-react";
import { type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import {
  OperationalMetric,
  OperationalPage,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { getImportData } from "@/lib/api";
import { ViewerDataTable } from "@/pages/viewer/ViewerDataTable";
import { ViewerFiltersPanel } from "@/pages/viewer/ViewerFiltersPanel";
import { ViewerFooter } from "@/pages/viewer/ViewerFooter";
import { ViewerPageHeader } from "@/pages/viewer/ViewerPageHeader";
import { ViewerSearchBar } from "@/pages/viewer/ViewerSearchBar";
import { resolveViewerExportBlockReason } from "@/pages/viewer/export-guards";
import {
  exportViewerRowsToCsv,
  exportViewerRowsToExcel,
  exportViewerRowsToPdf,
} from "@/pages/viewer/export";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";
import { extractHeadersFromRows, filterViewerRows } from "@/pages/viewer/utils";

const VIEWER_FILTER_OPERATOR_LABELS: Record<ColumnFilter["operator"], string> = {
  contains: "contains",
  equals: "is",
  startsWith: "starts with",
  endsWith: "ends with",
  notEquals: "is not",
};

interface ViewerProps {
  onNavigate: (page: string) => void;
  importId?: string;
  userRole: string;
  viewerRowsPerPage?: number;
}

type ViewerApiRow = {
  jsonDataJsonb?: Record<string, unknown>;
};

type ViewerPageResponse = {
  rows?: ViewerApiRow[];
  total?: number;
  page?: number;
  limit?: number;
  nextCursor?: string | null;
};

function resolveViewerImportName() {
  return (
    localStorage.getItem("selectedImportName") ||
    localStorage.getItem("analysisImportName") ||
    "Data Viewer"
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function normalizeViewerPageResult(
  response: ViewerPageResponse,
  requestedPage: number,
  fallbackLimit: number,
): {
  rows: DataRowWithId[];
  total: number;
  page: number;
  limit: number;
  nextCursor: string | null;
} {
  const page = Number.isFinite(Number(response?.page))
    ? Math.max(1, Math.trunc(Number(response?.page)))
    : requestedPage;
  const limit = Number.isFinite(Number(response?.limit))
    ? Math.max(1, Math.trunc(Number(response?.limit)))
    : fallbackLimit;
  const total = Number.isFinite(Number(response?.total))
    ? Math.max(0, Math.trunc(Number(response?.total)))
    : 0;
  const pageBase = (page - 1) * limit;
  const apiRows = Array.isArray(response?.rows) ? response.rows : [];

  return {
    rows: apiRows.map((row, index) => ({
      ...(row.jsonDataJsonb ?? {}),
      __rowId: pageBase + index,
    })),
    total,
    page,
    limit,
    nextCursor: typeof response?.nextCursor === "string" ? response.nextCursor : null,
  };
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
      setImportName(resolveViewerImportName());
      setRows([]);
      setHeaders([]);
      setHeadersLocked(false);
      headersLockedRef.current = false;
      setSelectedColumns(new Set());
      clearSelectionState();
      setEmptyHint("");
      setIsCleared(false);
      setCurrentPage(1);
      setCurrentPageSize(ROWS_PER_PAGE);
      setTotalRows(0);
      setNextCursor(null);
      setPageCursorHistory([null]);
      return;
    }

    cancelActiveFetch();
    activeRequestIdRef.current += 1;
    setRows([]);
    setHeaders([]);
    setHeadersLocked(false);
    headersLockedRef.current = false;
    setSelectedColumns(new Set());
    setColumnFilters([]);
    setSearch("");
    clearSelectionState();
    setImportName("Data Viewer");
    setEmptyHint("Open file in Saved tab first to view.");
    setIsCleared(true);
    setCurrentPage(1);
    setCurrentPageSize(ROWS_PER_PAGE);
    setTotalRows(0);
    setNextCursor(null);
    setPageCursorHistory([null]);
    setLoading(false);
    setLoadingMore(false);
  }, [ROWS_PER_PAGE, cancelActiveFetch, clearSelectionState, importId]);

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
      setRows([]);
      setTotalRows(0);
      setCurrentPageSize(ROWS_PER_PAGE);
      setNextCursor(null);
      setPageCursorHistory([null]);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    setNextCursor(null);
    setPageCursorHistory([null]);
    void fetchData(importId, { page: 1, cursor: null });
  }, [
    ROWS_PER_PAGE,
    cancelActiveFetch,
    clearSelectionState,
    debouncedColumnFilters,
    debouncedSearch,
    fetchData,
    importId,
    isCleared,
  ]);

  const activeColumnFilters = useMemo(
    () =>
      columnFilters.filter((filter) => {
        const normalizedValue = filter.value.trim();
        return filter.column.trim() !== "" && normalizedValue !== "";
      }),
    [columnFilters],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedColumnFilters(activeColumnFilters);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [SEARCH_DEBOUNCE_MS, activeColumnFilters]);

  const visibleHeaders = useMemo(
    () => headers.filter((header) => selectedColumns.has(header)),
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
    () => Math.max(900, 100 + visibleHeaders.length * 180),
    [visibleHeaders.length],
  );
  const gridTemplateColumns = useMemo(
    () => `44px 56px repeat(${Math.max(1, visibleHeaders.length)}, minmax(180px, 1fr))`,
    [visibleHeaders.length],
  );
  const totalPages = Math.max(1, Math.ceil(totalRows / Math.max(1, currentPageSize)));
  const pageStart = totalRows === 0 ? 0 : (currentPage - 1) * currentPageSize + 1;
  const pageEnd = totalRows === 0 ? 0 : Math.min(totalRows, pageStart + rows.length - 1);
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = nextCursor !== null;

  useEffect(() => {
    setSelectedRowIds((previous) => {
      if (previous.size === 0) return previous;
      const availableIds = new Set(rows.map((row) => row.__rowId));
      let changed = false;
      const next = new Set<number>();

      previous.forEach((id) => {
        if (availableIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });

      return changed ? next : previous;
    });
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
    if (headers.length > 0) {
      setColumnFilters((previous) => [
        ...previous,
        { column: headers[0], operator: "contains", value: "" },
      ]);
    }
  }, [headers]);

  const updateFilter = useCallback((index: number, field: keyof ColumnFilter, value: string) => {
    setColumnFilters((previous) =>
      previous.map((filter, filterIndex) =>
        filterIndex === index ? { ...filter, [field]: value } : filter,
      ),
    );
  }, []);

  const removeFilter = useCallback((index: number) => {
    setColumnFilters((previous) => previous.filter((_, filterIndex) => filterIndex !== index));
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
    setRows([]);
    setHeaders([]);
    setHeadersLocked(false);
    headersLockedRef.current = false;
    setSelectedColumns(new Set());
    setColumnFilters([]);
    setSearch("");
    clearSelectionState();
    setImportName("Data Viewer");
    setEmptyHint("Open file in Saved tab first to view.");
    setTotalRows(0);
    setCurrentPage(1);
    setCurrentPageSize(ROWS_PER_PAGE);
    setNextCursor(null);
    setPageCursorHistory([null]);
    setLoading(false);
    setLoadingMore(false);
    setIsCleared(true);
  }, [ROWS_PER_PAGE, cancelActiveFetch, clearSelectionState]);

  const toggleColumn = (column: string) => {
    setSelectedColumns((previous) => {
      const next = new Set(previous);
      if (next.has(column)) {
        if (next.size > 1) {
          next.delete(column);
        }
      } else {
        next.add(column);
      }
      return next;
    });
  };

  const selectAllColumns = () => {
    setSelectedColumns(new Set(headers));
  };

  const deselectAllColumns = () => {
    if (headers.length > 0) {
      setSelectedColumns(new Set([headers[0]]));
    }
  };

  const toggleRowSelection = useCallback((rowId: number) => {
    setSelectedRowIds((previous) => {
      const next = new Set(previous);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
    setSelectAllFiltered(false);
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    if (selectAllFiltered) {
      setSelectedRowIds(new Set());
      setSelectAllFiltered(false);
      return;
    }

    setSelectedRowIds(new Set(filteredRows.map((row) => row.__rowId)));
    setSelectAllFiltered(true);
  }, [filteredRows, selectAllFiltered]);

  const loadRowsForExport = useCallback(async (exportFiltered = false, exportSelected = false) => {
    if (exportSelected) {
      return rows.filter((row) => selectedRowIds.has(row.__rowId));
    }

    if (exportFiltered) {
      return filteredRows;
    }

    if (!importId || totalRows <= rows.length) {
      return rows;
    }

    exportAbortControllerRef.current?.abort();
    const controller = new AbortController();
    exportAbortControllerRef.current = controller;
    const exportRows: DataRowWithId[] = [];
    let pageToLoad = 1;
    let cursorToLoad: string | null = null;

    try {
      while (true) {
        const response = await getImportData(importId, pageToLoad, ROWS_PER_PAGE, debouncedSearch, {
          signal: controller.signal,
          cursor: cursorToLoad || undefined,
          columnFilters: debouncedColumnFilters,
        });
        const normalizedPage = normalizeViewerPageResult(response ?? {}, pageToLoad, ROWS_PER_PAGE);

        if (normalizedPage.rows.length === 0) {
          break;
        }

        exportRows.push(...normalizedPage.rows);

        if (!normalizedPage.nextCursor) {
          break;
        }

        cursorToLoad = normalizedPage.nextCursor;
        pageToLoad = normalizedPage.page + 1;
      }

      return exportRows;
    } finally {
      if (exportAbortControllerRef.current === controller) {
        exportAbortControllerRef.current = null;
      }
    }
  }, [ROWS_PER_PAGE, debouncedColumnFilters, debouncedSearch, filteredRows, importId, rows, selectedRowIds, totalRows]);

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const items: ActiveFilterChip[] = [];

    if (search.trim()) {
      items.push({
        id: "viewer-search",
        label: `Search: ${search.trim()}`,
        onRemove: () => {
          setSearch("");
          setCurrentPage(1);
        },
      });
    }

    activeColumnFilters.forEach((filter, index) => {
      items.push({
        id: `viewer-filter-${index}`,
        label: `${filter.column} ${VIEWER_FILTER_OPERATOR_LABELS[filter.operator]} ${filter.value}`,
        onRemove: () => removeFilter(index),
      });
    });

    return items;
  }, [activeColumnFilters, removeFilter, search]);

  const exportToCSV = async (exportFiltered = false, exportSelected = false) => {
    const blockReason = resolveViewerExportBlockReason({
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportFiltered,
      exportSelected,
      exportingExcel,
      exportingPdf,
    });
    if (blockReason === "busy" || exportInFlightRef.current) return;
    if (blockReason === "no_data") return;

    try {
      const dataToExport = await loadRowsForExport(exportFiltered, exportSelected);
      if (dataToExport.length === 0) return;

      exportViewerRowsToCsv({
        headers: visibleHeaders,
        rows: dataToExport,
        importName,
        exportFiltered,
        exportSelected,
      });
    } catch (exportError) {
      if (isAbortError(exportError)) {
        return;
      }
      console.error("Failed to export CSV:", exportError);
      alert(
        `Failed to export CSV: ${
          exportError instanceof Error ? exportError.message : "Unknown error"
        }`,
      );
    }
  };

  const exportToPDF = async (exportFiltered = false, exportSelected = false) => {
    const blockReason = resolveViewerExportBlockReason({
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportFiltered,
      exportSelected,
      exportingExcel,
      exportingPdf,
    });
    if (blockReason === "busy" || exportInFlightRef.current) return;
    if (blockReason === "no_data") return;

    exportInFlightRef.current = "pdf";
    setExportingPdf(true);
    try {
      const dataToExport = await loadRowsForExport(exportFiltered, exportSelected);
      if (dataToExport.length === 0) return;

      await exportViewerRowsToPdf({
        headers: visibleHeaders,
        rows: dataToExport,
        importName,
        exportFiltered,
        exportSelected,
      });
    } catch (exportError) {
      if (isAbortError(exportError)) {
        return;
      }
      console.error("Failed to export PDF:", exportError);
      alert(
        `Failed to export PDF: ${
          exportError instanceof Error ? exportError.message : "Unknown error"
        }`,
      );
    } finally {
      exportInFlightRef.current = null;
      setExportingPdf(false);
    }
  };

  const exportToExcel = async (exportFiltered = false, exportSelected = false) => {
    const blockReason = resolveViewerExportBlockReason({
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportFiltered,
      exportSelected,
      exportingExcel,
      exportingPdf,
    });
    if (blockReason === "busy" || exportInFlightRef.current) return;
    if (blockReason === "no_data") return;

    exportInFlightRef.current = "excel";
    setExportingExcel(true);
    try {
      const dataToExport = await loadRowsForExport(exportFiltered, exportSelected);
      if (dataToExport.length === 0) return;

      await exportViewerRowsToExcel({
        headers: visibleHeaders,
        rows: dataToExport,
        importName,
        exportFiltered,
        exportSelected,
      });
    } catch (exportError) {
      if (isAbortError(exportError)) {
        return;
      }
      console.error("Failed to export Excel:", exportError);
      alert(
        `Failed to export Excel: ${
          exportError instanceof Error ? exportError.message : "Unknown error"
        }`,
      );
    } finally {
      exportInFlightRef.current = null;
      setExportingExcel(false);
    }
  };

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
        onBack={() => onNavigate("saved")}
        onShowColumnSelectorChange={setShowColumnSelector}
        onToggleColumn={toggleColumn}
        onSelectAllColumns={selectAllColumns}
        onDeselectAllColumns={deselectAllColumns}
        onToggleFilters={() => setShowFilters((previous) => !previous)}
        onClearAllData={clearAllData}
        onExportCsv={(exportFiltered, exportSelected) => {
          void exportToCSV(exportFiltered, exportSelected);
        }}
        onExportPdf={(exportFiltered, exportSelected) => {
          void exportToPDF(exportFiltered, exportSelected);
        }}
        onExportExcel={(exportFiltered, exportSelected) => {
          void exportToExcel(exportFiltered, exportSelected);
        }}
      />

      {rows.length > 0 ? (
        <OperationalSummaryStrip>
          <OperationalMetric
            label="Page rows"
            value={rows.length}
            supporting={totalRows > 0 ? `Rows ${pageStart}-${pageEnd} of ${totalRows}` : "No rows loaded"}
          />
          <OperationalMetric
            label="Visible columns"
            value={`${visibleHeaders.length}/${headers.length || visibleHeaders.length}`}
            supporting="Current table layout"
          />
          <OperationalMetric
            label="Selected rows"
            value={selectedRowIds.size}
            supporting={selectedRowIds.size > 0 ? "Ready for focused export" : "No rows selected"}
          />
        </OperationalSummaryStrip>
      ) : null}

      {rows.length > 0 && showFilters ? (
        <ViewerFiltersPanel
          headers={headers}
          columnFilters={columnFilters}
          onAddFilter={addFilter}
          onClearAllFilters={clearAllFilters}
          onUpdateFilter={updateFilter}
          onRemoveFilter={removeFilter}
        />
      ) : null}

      {error ? (
        <OperationalSectionCard className="border-destructive/35 bg-destructive/5" contentClassName="space-y-0">
          <div className="flex flex-wrap items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">{error}</span>
            <Button variant="ghost" onClick={() => onNavigate("saved")} className="ml-auto text-destructive">
              Back to Saved Imports
            </Button>
          </div>
        </OperationalSectionCard>
      ) : null}

      {loading ? (
        <div className="ops-empty-state">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading data...</p>
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="ops-empty-state">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Eye className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">No data</p>
          {emptyHint ? <p className="text-sm text-muted-foreground mt-2">{emptyHint}</p> : null}
          {isSearchBelowMinLength ? (
            <p className="text-sm text-muted-foreground mt-2">
              Enter at least {MIN_SEARCH_LENGTH} characters to search large datasets.
            </p>
          ) : null}
        </div>
      ) : (
        <OperationalSectionCard
          title="Dataset rows"
          description="Search the dataset, review one page at a time, and export only what you need."
          contentClassName="space-y-4"
        >
          {rows.length > 0 ? (
            <ViewerSearchBar
              search={search}
              filteredRowsCount={filteredRows.length}
              rowsCount={rows.length}
              showResultsSummary={columnFilters.length > 0 || isServerSearchActive}
              activeFilters={activeFilterChips}
              onClearAllFilters={clearAllFilters}
              onSearchChange={(value) => {
                setSearch(value);
                setCurrentPage(1);
              }}
            />
          ) : null}

          <ViewerDataTable
            debouncedSearch={debouncedSearch}
            enableVirtualRows={enableVirtualRows}
            filteredRows={filteredRows}
            gridTemplateColumns={gridTemplateColumns}
            minSearchLength={MIN_SEARCH_LENGTH}
            onToggleRowSelection={toggleRowSelection}
            onToggleSelectAllFiltered={toggleSelectAllFiltered}
            rowHeightPx={rowHeightPx}
            selectedRowIds={selectedRowIds}
            selectAllFiltered={selectAllFiltered}
            virtualTableMinWidth={virtualTableMinWidth}
            viewportHeightPx={viewportHeightPx}
            visibleHeaders={visibleHeaders}
          />

          <ViewerFooter
            filteredRowsCount={filteredRows.length}
            rowsCount={rows.length}
            totalRows={totalRows}
            currentPage={currentPage}
            totalPages={totalPages}
            pageStart={pageStart}
            pageEnd={pageEnd}
            selectedRowCount={selectedRowIds.size}
            hasPageFilterSubset={hasPageFilterSubset}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            loadingMore={loadingMore}
            onClearSelection={clearSelectionState}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
          />
        </OperationalSectionCard>
      )}
    </OperationalPage>
  );
}
