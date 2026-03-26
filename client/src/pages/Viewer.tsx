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

function resolveViewerImportName() {
  return (
    localStorage.getItem("selectedImportName") ||
    localStorage.getItem("analysisImportName") ||
    "Data Viewer"
  );
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
  const [totalRows, setTotalRows] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const mountedRef = useRef(true);
  const rowIdCounterRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const exportInFlightRef = useRef<"excel" | "pdf" | null>(null);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const headersLockedRef = useRef(headersLocked);
  const ROWS_PER_PAGE = configuredRowsPerPage;
  const MAX_ROWS_IN_MEMORY = isLowSpecMode ? 240 : 1200;
  const MIN_SEARCH_LENGTH = 2;
  const SEARCH_DEBOUNCE_MS = 300;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestIdRef.current += 1;
      fetchAbortControllerRef.current?.abort();
      fetchAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    headersLockedRef.current = headersLocked;
  }, [headersLocked]);

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

  const fetchData = useCallback(async (id: string, page = 1, append = false) => {
    if (!id) return;

    cancelActiveFetch();
    const requestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;

    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    setError("");

    try {
      const response = await getImportData(id, page, ROWS_PER_PAGE, debouncedSearch, {
        signal: controller.signal,
      });
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        requestId !== activeRequestIdRef.current
      ) {
        return;
      }

      const apiRows = response.rows ?? [];
      const total = response.total ?? 0;

      if (page === 1 && !append) {
        rowIdCounterRef.current = 0;
      }

      const parsedRows: DataRowWithId[] = apiRows.map(
        (row: { jsonDataJsonb?: Record<string, unknown> }) => ({
          ...(row.jsonDataJsonb ?? {}),
          __rowId: rowIdCounterRef.current++,
        }),
      );

      if (page === 1 && parsedRows.length > 0 && !headersLockedRef.current) {
        const detectedHeaders = extractHeadersFromRows(parsedRows);
        if (detectedHeaders.length > 0) {
          setHeaders(detectedHeaders);
          setSelectedColumns(new Set(detectedHeaders));
          headersLockedRef.current = true;
          setHeadersLocked(true);
        }
      }

      if (append) {
        setRows((previous) => {
          const merged = [...previous, ...parsedRows];
          if (merged.length <= MAX_ROWS_IN_MEMORY) {
            return merged;
          }
          return merged.slice(merged.length - MAX_ROWS_IN_MEMORY);
        });
      } else {
        setRows(parsedRows);
      }

      const nextLoadedRowsCount =
        page === 1 ? parsedRows.length : (page - 1) * ROWS_PER_PAGE + parsedRows.length;

      setCurrentPage(page);
      setTotalRows(total);
      setHasMore(nextLoadedRowsCount < total);
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
  }, [ROWS_PER_PAGE, MAX_ROWS_IN_MEMORY, cancelActiveFetch, debouncedSearch]);

  useEffect(() => {
    if (importId) {
      cancelActiveFetch();
      setImportName(resolveViewerImportName());
      setHeaders([]);
      setHeadersLocked(false);
      headersLockedRef.current = false;
      rowIdCounterRef.current = 0;
      setEmptyHint("");
      setIsCleared(false);
      void fetchData(importId, 1, false);
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
    setLoading(false);
    setLoadingMore(false);
  }, [cancelActiveFetch, clearSelectionState, importId]);

  useEffect(() => {
    clearSelectionState();
  }, [clearSelectionState, columnFilters]);

  useEffect(() => {
    setCurrentPage(1);
    setHasMore(false);
    clearSelectionState();

    if (isCleared || !importId) {
      return;
    }

    if (debouncedSearch && debouncedSearch.length < MIN_SEARCH_LENGTH) {
      cancelActiveFetch();
      activeRequestIdRef.current += 1;
      setRows([]);
      setTotalRows(0);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    void fetchData(importId, 1, false);
  }, [ROWS_PER_PAGE, cancelActiveFetch, clearSelectionState, debouncedSearch, fetchData, importId, isCleared]);

  const activeColumnFilters = useMemo(
    () =>
      columnFilters.filter((filter) => {
        const normalizedValue = filter.value.trim();
        return filter.column.trim() !== "" && normalizedValue !== "";
      }),
    [columnFilters],
  );

  const visibleHeaders = useMemo(
    () => headers.filter((header) => selectedColumns.has(header)),
    [headers, selectedColumns],
  );
  const isSearchBelowMinLength =
    debouncedSearch.length > 0 && debouncedSearch.length < MIN_SEARCH_LENGTH;
  const isServerSearchActive = debouncedSearch.length >= MIN_SEARCH_LENGTH;
  const hasAnySearchTerm = debouncedSearch.length > 0;
  const isFiltering = isServerSearchActive || activeColumnFilters.length > 0;
  const filteredRows = useMemo(
    () => filterViewerRows(rows, activeColumnFilters),
    [activeColumnFilters, rows],
  );
  const hasFilteredSubset = isFiltering && filteredRows.length !== rows.length;
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

  const loadMore = () => {
    if (hasAnySearchTerm || !importId || !hasMore || loadingMore) return;
    void fetchData(importId, currentPage + 1, true);
  };

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

  const clearAllData = () => {
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
    setTotalRows(0);
    setHasMore(false);
    setCurrentPage(1);
    setLoading(false);
    setLoadingMore(false);
    rowIdCounterRef.current = 0;
    setIsCleared(true);
  };

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

  const resolveRowsForExport = (exportFiltered = false, exportSelected = false) => {
    let dataToExport = rows;

    if (exportFiltered) {
      dataToExport = filteredRows;
    }
    if (exportSelected && selectedRowIds.size > 0) {
      dataToExport = rows.filter((row) => selectedRowIds.has(row.__rowId));
    }

    return dataToExport;
  };

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

  const exportToCSV = (exportFiltered = false, exportSelected = false) => {
    const dataToExport = resolveRowsForExport(exportFiltered, exportSelected);
    if (dataToExport.length === 0) return;

    exportViewerRowsToCsv({
      headers: visibleHeaders,
      rows: dataToExport,
      importName,
      exportFiltered,
      exportSelected,
    });
  };

  const exportToPDF = async (exportFiltered = false, exportSelected = false) => {
    const dataToExport = resolveRowsForExport(exportFiltered, exportSelected);
    const blockReason = resolveViewerExportBlockReason({
      rowsLength: dataToExport.length,
      exportingExcel,
      exportingPdf,
    });
    if (blockReason === "busy" || exportInFlightRef.current) return;
    if (blockReason === "no_data") return;

    exportInFlightRef.current = "pdf";
    setExportingPdf(true);
    try {
      await exportViewerRowsToPdf({
        headers: visibleHeaders,
        rows: dataToExport,
        importName,
        exportFiltered,
        exportSelected,
      });
    } catch (exportError) {
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
    const dataToExport = resolveRowsForExport(exportFiltered, exportSelected);
    const blockReason = resolveViewerExportBlockReason({
      rowsLength: dataToExport.length,
      exportingExcel,
      exportingPdf,
    });
    if (blockReason === "busy" || exportInFlightRef.current) return;
    if (blockReason === "no_data") return;

    exportInFlightRef.current = "excel";
    setExportingExcel(true);
    try {
      await exportViewerRowsToExcel({
        headers: visibleHeaders,
        rows: dataToExport,
        importName,
        exportFiltered,
        exportSelected,
      });
    } catch (exportError) {
      console.error("Failed to export Excel:", exportError);
      alert(
        `Failed to export Excel: ${
          exportError instanceof Error ? exportError.message : "Unknown error"
        }`,
      );
    }
    finally {
      exportInFlightRef.current = null;
      setExportingExcel(false);
    }
  };

  return (
    <OperationalPage width="content">
        <ViewerPageHeader
          importName={importName}
          rowsCount={rows.length}
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
          onExportCsv={exportToCSV}
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
              label="Loaded rows"
              value={rows.length}
              supporting={`${totalRows} total available`}
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
            description="Search the loaded dataset, scan visible columns, and export only what you need."
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
              isFiltering={isFiltering}
              rowsCount={rows.length}
              totalRows={totalRows}
              selectedRowCount={selectedRowIds.size}
              isServerSearchActive={isServerSearchActive}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onClearSelection={clearSelectionState}
              onLoadMore={loadMore}
            />
          </OperationalSectionCard>
        )}
    </OperationalPage>
  );
}
