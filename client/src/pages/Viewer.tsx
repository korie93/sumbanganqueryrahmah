import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getImportData } from "@/lib/api";
import { ViewerDataTable } from "@/pages/viewer/ViewerDataTable";
import { ViewerFiltersPanel } from "@/pages/viewer/ViewerFiltersPanel";
import { ViewerFooter } from "@/pages/viewer/ViewerFooter";
import { ViewerPageHeader } from "@/pages/viewer/ViewerPageHeader";
import { ViewerSearchBar } from "@/pages/viewer/ViewerSearchBar";
import {
  exportViewerRowsToCsv,
  exportViewerRowsToExcel,
  exportViewerRowsToPdf,
} from "@/pages/viewer/export";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";
import { extractHeadersFromRows, filterViewerRows } from "@/pages/viewer/utils";

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
  const [exportingPdf, setExportingPdf] = useState(false);
  const [emptyHint, setEmptyHint] = useState("");
  const [isCleared, setIsCleared] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const rowIdCounterRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const ROWS_PER_PAGE = configuredRowsPerPage;
  const MAX_ROWS_IN_MEMORY = isLowSpecMode ? 240 : 1200;
  const MIN_SEARCH_LENGTH = 2;
  const SEARCH_DEBOUNCE_MS = 300;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchData = async (id: string, page = 1, append = false) => {
    if (!id) return;

    const requestId = ++activeRequestIdRef.current;

    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    setError("");

    try {
      const response = await getImportData(id, page, ROWS_PER_PAGE, debouncedSearch);
      if (requestId !== activeRequestIdRef.current) {
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

      if (page === 1 && parsedRows.length > 0 && !headersLocked) {
        const detectedHeaders = extractHeadersFromRows(parsedRows);
        if (detectedHeaders.length > 0) {
          setHeaders(detectedHeaders);
          setSelectedColumns(new Set(detectedHeaders));
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
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch data");
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    if (importId) {
      setImportName(resolveViewerImportName());
      setHeaders([]);
      setHeadersLocked(false);
      rowIdCounterRef.current = 0;
      setEmptyHint("");
      setIsCleared(false);
      void fetchData(importId, 1, false);
      return;
    }

    activeRequestIdRef.current += 1;
    setRows([]);
    setHeaders([]);
    setSelectedColumns(new Set());
    setColumnFilters([]);
    setSearch("");
    setSelectedRowIds(new Set());
    setSelectAllFiltered(false);
    setImportName("Data Viewer");
    setEmptyHint("Open file in Saved tab first to view.");
    setIsCleared(true);
    setLoading(false);
    setLoadingMore(false);
  }, [importId]);

  useEffect(() => {
    setCurrentPage(1);
    setHasMore(false);
    setSelectedRowIds(new Set());
    setSelectAllFiltered(false);

    if (isCleared || !importId) {
      return;
    }

    if (debouncedSearch && debouncedSearch.length < MIN_SEARCH_LENGTH) {
      activeRequestIdRef.current += 1;
      setRows([]);
      setTotalRows(0);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    void fetchData(importId, 1, false);
  }, [ROWS_PER_PAGE, columnFilters, debouncedSearch, importId, isCleared]);

  const visibleHeaders = useMemo(
    () => headers.filter((header) => selectedColumns.has(header)),
    [headers, selectedColumns],
  );
  const isSearchBelowMinLength =
    debouncedSearch.length > 0 && debouncedSearch.length < MIN_SEARCH_LENGTH;
  const isServerSearchActive = debouncedSearch.length >= MIN_SEARCH_LENGTH;
  const hasAnySearchTerm = debouncedSearch.length > 0;
  const isFiltering = isServerSearchActive || columnFilters.length > 0;
  const filteredRows = useMemo(() => filterViewerRows(rows, columnFilters), [columnFilters, rows]);
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

  const addFilter = () => {
    if (headers.length > 0) {
      setColumnFilters((previous) => [
        ...previous,
        { column: headers[0], operator: "contains", value: "" },
      ]);
    }
  };

  const updateFilter = (index: number, field: keyof ColumnFilter, value: string) => {
    setColumnFilters((previous) =>
      previous.map((filter, filterIndex) =>
        filterIndex === index ? { ...filter, [field]: value } : filter,
      ),
    );
  };

  const removeFilter = (index: number) => {
    setColumnFilters((previous) => previous.filter((_, filterIndex) => filterIndex !== index));
  };

  const clearAllFilters = () => {
    setColumnFilters([]);
    setSearch("");
  };

  const clearAllData = () => {
    activeRequestIdRef.current += 1;
    setRows([]);
    setHeaders([]);
    setHeadersLocked(false);
    setSelectedColumns(new Set());
    setColumnFilters([]);
    setSearch("");
    setSelectedRowIds(new Set());
    setSelectAllFiltered(false);
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

  const toggleRowSelection = (rowId: number) => {
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
  };

  const toggleSelectAllFiltered = () => {
    if (selectAllFiltered) {
      setSelectedRowIds(new Set());
      setSelectAllFiltered(false);
      return;
    }

    setSelectedRowIds(new Set(filteredRows.map((row) => row.__rowId)));
    setSelectAllFiltered(true);
  };

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
    if (dataToExport.length === 0) return;

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
      setExportingPdf(false);
    }
  };

  const exportToExcel = async (exportFiltered = false, exportSelected = false) => {
    const dataToExport = resolveRowsForExport(exportFiltered, exportSelected);
    if (dataToExport.length === 0) return;

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
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <ViewerPageHeader
          importName={importName}
          rowsCount={rows.length}
          headers={headers}
          selectedColumns={selectedColumns}
          showColumnSelector={showColumnSelector}
          showFilters={showFilters}
          filterCount={columnFilters.length}
          isSuperuser={isSuperuser}
          exportingPdf={exportingPdf}
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
          <div className="glass-wrapper p-4 mb-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
            <Button variant="ghost" onClick={() => onNavigate("saved")} className="ml-auto">
              Back to Saved Imports
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="glass-wrapper p-12 text-center">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading data...</p>
          </div>
        ) : rows.length === 0 && !error ? (
          <div className="glass-wrapper p-12 text-center">
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
          <div className="glass-wrapper p-6">
            {rows.length > 0 ? (
              <ViewerSearchBar
                search={search}
                filteredRowsCount={filteredRows.length}
                rowsCount={rows.length}
                showResultsSummary={columnFilters.length > 0 || isServerSearchActive}
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
              onClearSelection={() => {
                setSelectedRowIds(new Set());
                setSelectAllFiltered(false);
              }}
              onLoadMore={loadMore}
            />
          </div>
        )}
      </div>
    </div>
  );
}
