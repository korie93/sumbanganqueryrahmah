import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Eye, Download, ArrowLeft, Search, AlertCircle, Filter, X, Check, Columns, Trash2, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getImportData } from "@/lib/api";
import { FixedSizeList, type ListChildComponentProps } from "react-window";

interface ViewerProps {
  onNavigate: (page: string) => void;
  importId?: string;
  userRole: string;
  viewerRowsPerPage?: number;
}

interface ColumnFilter {
  column: string;
  operator: "contains" | "equals" | "startsWith" | "endsWith" | "notEquals";
  value: string;
}

interface DataRowWithId {
  __rowId: number;
  [key: string]: any;
}

interface ViewerVirtualRowData {
  rows: DataRowWithId[];
  visibleHeaders: string[];
  selectedRowIds: Set<number>;
  onToggleRowSelection: (rowId: number) => void;
  gridTemplateColumns: string;
}

function extractHeadersFromRows(rows: DataRowWithId[]): string[] {
  const headerSet = new Set<string>();

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key !== "__rowId") {
        headerSet.add(key);
      }
    });
  });

  return Array.from(headerSet);
}

export default function Viewer({ onNavigate, importId, userRole, viewerRowsPerPage }: ViewerProps) {
  const isLowSpecMode =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("low-spec");
  const configuredRowsPerPage = useMemo(() => {
    const parsed = Number(viewerRowsPerPage);
    if (!Number.isFinite(parsed)) return isLowSpecMode ? 40 : 100;
    return Math.min(500, Math.max(10, Math.floor(parsed)));
  }, [viewerRowsPerPage, isLowSpecMode]);
  const isSuperuser = userRole === "superuser";
  const [rows, setRows] = useState<DataRowWithId[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [headersLocked, setHeadersLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [error, setError] = useState("");
  const [importName, setImportName] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const rowIdCounterRef = useRef(0);
  const [emptyHint, setEmptyHint] = useState("");
  const [isCleared, setIsCleared] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadedRowsCount, setLoadedRowsCount] = useState(0);
  const ROWS_PER_PAGE = configuredRowsPerPage;
  const MAX_ROWS_IN_MEMORY = isLowSpecMode ? 240 : 1200;
  const MIN_SEARCH_LENGTH = 2;
  const SEARCH_DEBOUNCE_MS = 300;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, SEARCH_DEBOUNCE_MS]);

  useEffect(() => {
    if (importId) {
      setImportName("Data Viewer");
      setHeaders([]);
      setHeadersLocked(false);
      rowIdCounterRef.current = 0;
      setLoadedRowsCount(0);
      setEmptyHint("");
      setIsCleared(false);
      fetchData(importId, 1, false);
    } else {
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
    }
  }, [importId]);

  useEffect(() => {
    setCurrentPage(1);
    setHasMore(false);
    setSelectedRowIds(new Set());
    setSelectAllFiltered(false);

    const savedId = importId;
    if (isCleared || !savedId) {
      return;
    }

    // 🔒 MIN SEARCH LENGTH (FRONTEND GUARD)
    if (
      debouncedSearch &&
      debouncedSearch.length < MIN_SEARCH_LENGTH
    ) {
      setRows([]);
      setTotalRows(0);
      return;
    }

    fetchData(savedId, 1, false);
  }, [debouncedSearch, columnFilters, ROWS_PER_PAGE]);

  const fetchData = async (
    id: string,
    page: number = 1,
    append: boolean = false
  ) => {
    if (!id) return;

    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    setError("");

    try {
      const response = await getImportData(
        id,
        page,
        ROWS_PER_PAGE,
        debouncedSearch
      );

      const apiRows = response.rows ?? [];
      const total = response.total ?? 0;
      if (page === 1 && !append) {
        rowIdCounterRef.current = 0;
      }

      const parsedRows: DataRowWithId[] = apiRows.map(
        (row: any) => ({
          ...(row.jsonDataJsonb ?? {}),
          __rowId: rowIdCounterRef.current++,
        })
      );

      if (page === 1 && parsedRows.length > 0 && !headersLocked) {
        const detectedHeaders = extractHeadersFromRows(parsedRows);

        if (detectedHeaders.length > 0) {
          setHeaders(detectedHeaders);
          setSelectedColumns(new Set(detectedHeaders));
          setHeadersLocked(true); // 🔒 LOCK HEADER
        }
      }

      // 🔹 SET ROWS
      if (append) {
        setRows((prev) => {
          const merged = [...prev, ...parsedRows];
          if (merged.length <= MAX_ROWS_IN_MEMORY) return merged;
          return merged.slice(merged.length - MAX_ROWS_IN_MEMORY);
        });
      } else {
        setRows(parsedRows);
      }

      const nextLoadedRowsCount = append
        ? loadedRowsCount + parsedRows.length
        : parsedRows.length;

      setCurrentPage(page);
      setTotalRows(total);
      setLoadedRowsCount(nextLoadedRowsCount);
      setHasMore(nextLoadedRowsCount < total);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch data");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (isServerSearchActive) return;
    const savedId = importId;
    if (savedId && hasMore && !loadingMore) {
      fetchData(savedId, currentPage + 1, true);
    }
  };

  const addFilter = () => {
    if (headers.length > 0) {
      setColumnFilters([
        ...columnFilters,
        { column: headers[0], operator: "contains", value: "" },
      ]);
    }
  };

  const updateFilter = (index: number, field: keyof ColumnFilter, value: string) => {
    const updated = [...columnFilters];
    updated[index] = { ...updated[index], [field]: value };
    setColumnFilters(updated);
  };

  const removeFilter = (index: number) => {
    setColumnFilters(columnFilters.filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    setColumnFilters([]);
    setSearch("");
  };

  const clearAllData = () => {
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
    setLoadedRowsCount(0);
    rowIdCounterRef.current = 0;
    setIsCleared(true);
  };

  const toggleColumn = (column: string) => {
    const updated = new Set(selectedColumns);
    if (updated.has(column)) {
      if (updated.size > 1) {
        updated.delete(column);
      }
    } else {
      updated.add(column);
    }
    setSelectedColumns(updated);
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
    const updated = new Set(selectedRowIds);
    if (updated.has(rowId)) {
      updated.delete(rowId);
    } else {
      updated.add(rowId);
    }
    setSelectedRowIds(updated);
    setSelectAllFiltered(false);
  };

  const toggleSelectAllFiltered = () => {
    if (selectAllFiltered) {
      setSelectedRowIds(new Set());
      setSelectAllFiltered(false);
    } else {
      setSelectedRowIds(new Set(filteredRows.map((row) => row.__rowId)));
      setSelectAllFiltered(true);
    }
  };

  const exportToCSV = (exportFiltered: boolean = false, exportSelected: boolean = false) => {
    let dataToExport: DataRowWithId[] = rows;

    if (exportFiltered) {
      dataToExport = filteredRows;
    }

    if (exportSelected && selectedRowIds.size > 0) {
      dataToExport = rows.filter((row) => selectedRowIds.has(row.__rowId));
    }

    if (dataToExport.length === 0) return;

    const exportHeaders = headers.filter((h) => selectedColumns.has(h));

    const csvContent = [
      exportHeaders.join(","),
      ...dataToExport.map((row) =>
        exportHeaders.map((h) => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);

    let filename = `SQR-${importName || "export"}`;
    if (exportFiltered) filename += "-filtered";
    if (exportSelected) filename += "-selected";
    link.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const exportToPDF = async (exportFiltered: boolean = false, exportSelected: boolean = false) => {
    let dataToExport: DataRowWithId[] = rows;
    if (exportFiltered) dataToExport = filteredRows;
    if (exportSelected && selectedRowIds.size > 0) {
      dataToExport = rows.filter((row) => selectedRowIds.has(row.__rowId));
    }
    if (dataToExport.length === 0) return;

    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const exportHeaders = headers.filter((h) => selectedColumns.has(h));
      const isDark = document.documentElement.classList.contains("dark");

      const useLandscape = exportHeaders.length > 4;
      const pdf = new jsPDF({
        orientation: useLandscape ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      let yPos = margin;

      pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");

      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(isDark ? 255 : 30);
      pdf.text(importName || "Data Export", margin, yPos + 5);
      yPos += 10;

      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(isDark ? 180 : 100);
      let exportType = "All Data";
      if (exportFiltered) exportType = "Filtered Data";
      if (exportSelected) exportType = "Selected Data";
      pdf.text(`${exportType} | ${dataToExport.length} rows | ${new Date().toLocaleString()}`, margin, yPos);
      yPos += 6;

      pdf.setDrawColor(isDark ? 100 : 200);
      pdf.setLineWidth(0.3);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 4;

      const tableWidth = pageWidth - margin * 2;
      const maxColsPerPage = useLandscape ? 10 : 6;
      const fontSize = exportHeaders.length > 8 ? 6 : (exportHeaders.length > 5 ? 7 : 8);
      const rowHeight = fontSize <= 6 ? 5 : 6;

      const minColWidth = 18;
      const colWidth = Math.max(minColWidth, tableWidth / Math.min(exportHeaders.length, maxColsPerPage));
      const maxCharsPerCol = Math.floor((colWidth - 2) / (fontSize * 0.35));
      const maxRowsPerPage = Math.floor((pageHeight - yPos - 15) / rowHeight);

      const truncateText = (text: string, maxLen: number): string => {
        if (text.length <= maxLen) return text;
        return text.substring(0, maxLen - 2) + "..";
      };

      const drawHeader = () => {
        pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
        pdf.rect(margin, yPos, tableWidth, rowHeight, "F");
        pdf.setFontSize(fontSize);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(isDark ? 255 : 30);
        exportHeaders.forEach((header, i) => {
          const xPos = margin + i * colWidth + 1;
          if (xPos < pageWidth - margin) {
            const text = truncateText(header, maxCharsPerCol);
            pdf.text(text, xPos, yPos + rowHeight - 1.5);
          }
        });
        yPos += rowHeight;
      };

      drawHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize);
      let rowsOnPage = 0;
      let pageNum = 1;

      dataToExport.forEach((row, rowIndex) => {
        if (rowsOnPage >= maxRowsPerPage - 1) {
          pdf.setFontSize(7);
          pdf.setTextColor(isDark ? 120 : 150);
          pdf.text(`Page ${pageNum}`, pageWidth - margin - 12, pageHeight - 6);
          pdf.text("SQR System", margin, pageHeight - 6);

          pdf.addPage();
          pageNum++;
          yPos = margin;
          rowsOnPage = 0;

          pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
          pdf.rect(0, 0, pageWidth, pageHeight, "F");
          drawHeader();
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(fontSize);
        }

        if (rowIndex % 2 === 0) {
          pdf.setFillColor(isDark ? 40 : 245, isDark ? 50 : 245, isDark ? 60 : 250);
          pdf.rect(margin, yPos, tableWidth, rowHeight, "F");
        }

        pdf.setTextColor(isDark ? 220 : 50);
        exportHeaders.forEach((header, i) => {
          const xPos = margin + i * colWidth + 1;
          if (xPos < pageWidth - margin) {
            const cellValue = String(row[header] || "");
            const text = truncateText(cellValue, maxCharsPerCol);
            pdf.text(text, xPos, yPos + rowHeight - 1.5);
          }
        });
        yPos += rowHeight;
        rowsOnPage++;
      });

      pdf.setFontSize(8);
      pdf.setTextColor(isDark ? 120 : 150);
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
      pdf.text("SQR System", margin, pageHeight - 8);

      let filename = `SQR-${importName || "export"}`;
      if (exportFiltered) filename += "-filtered";
      if (exportSelected) filename += "-selected";
      pdf.save(`${filename}-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error: any) {
      console.error("Failed to export PDF:", error);
      alert("Failed to export PDF: " + (error?.message || "Unknown error"));
    } finally {
      setExportingPdf(false);
    }
  };

  const exportToExcel = async (exportFiltered: boolean = false, exportSelected: boolean = false) => {
    let dataToExport: DataRowWithId[] = rows;
    if (exportFiltered) {
      dataToExport = filteredRows;
    }
    if (exportSelected && selectedRowIds.size > 0) {
      dataToExport = rows.filter((row) => selectedRowIds.has(row.__rowId));
    }
    if (dataToExport.length === 0) return;

    const exportHeaders = headers.filter((h) => selectedColumns.has(h));

    const icPatterns = /^(ic|no\.?\s*kp|no\.?\s*ic|id\s*no|ic\s*no|no\s*pengenalan|kad\s*pengenalan)/i;
    const potentialIcColumns = exportHeaders.filter(h => icPatterns.test(h.replace(/[_-]/g, ' ')));

    const worksheetData = dataToExport.map((row) => {
      const rowData: Record<string, string | number> = {};
      exportHeaders.forEach((header) => {
        const value = row[header];
        const strValue = String(value || "");

        const isIcColumn = potentialIcColumns.includes(header);
        const looksLikeIc = /^\d{6,14}$/.test(strValue.replace(/[-\s]/g, ''));

        if (isIcColumn || (looksLikeIc && strValue.length >= 6)) {
          rowData[header] = strValue;
        } else {
          rowData[header] = value ?? "";
        }
      });
      return rowData;
    });

    try {
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);

      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
      for (let C = range.s.c; C <= range.e.c; C++) {
        const headerCell = XLSX.utils.encode_cell({ r: 0, c: C });
        const headerValue = worksheet[headerCell]?.v;

        const isIcColumn = potentialIcColumns.includes(headerValue);

        if (isIcColumn) {
          for (let R = range.s.r + 1; R <= range.e.r; R++) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (worksheet[cellAddress]) {
              worksheet[cellAddress].t = "s";
              worksheet[cellAddress].z = "@";
            }
          }
        }
      }

      const colWidths = exportHeaders.map((h) => {
        const maxLength = Math.max(
          h.length,
          ...dataToExport.slice(0, 100).map((row) => String(row[h] || "").length)
        );
        return { wch: Math.min(maxLength + 2, 50) };
      });
      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

      let filename = `SQR-${importName || "export"}`;
      if (exportFiltered) filename += "-filtered";
      if (exportSelected) filename += "-selected";
      XLSX.writeFile(workbook, `${filename}-${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (error: any) {
      console.error("Failed to export Excel:", error);
      alert("Failed to export Excel: " + (error?.message || "Unknown error"));
    }
  };

  const visibleHeaders = useMemo(
    () => headers.filter((h) => selectedColumns.has(h)),
    [headers, selectedColumns]
  );
  const isServerSearchActive = debouncedSearch.length > 0;
  const isFiltering =
    isServerSearchActive || columnFilters.length > 0;


  const filteredRows = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    // 🔥 OPTION A:
    // Server dah buat keyword search
    // Frontend hanya buat COLUMN FILTER sahaja
    if (columnFilters.length === 0) {
      return rows;
    }

    return rows.filter((row) =>
      columnFilters.every((filter) => {
        const cellValue = String(row[filter.column] ?? "").toLowerCase();
        const filterValue = filter.value.toLowerCase();

        switch (filter.operator) {
          case "contains":
            return cellValue.includes(filterValue);
          case "equals":
            return cellValue === filterValue;
          case "startsWith":
            return cellValue.startsWith(filterValue);
          case "endsWith":
            return cellValue.endsWith(filterValue);
          case "notEquals":
            return cellValue !== filterValue;
          default:
            return true;
        }
      })
    );
  }, [rows, columnFilters]);

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
  const virtualRowData = useMemo<ViewerVirtualRowData>(
    () => ({
      rows: filteredRows,
      visibleHeaders,
      selectedRowIds,
      onToggleRowSelection: toggleRowSelection,
      gridTemplateColumns,
    }),
    [filteredRows, gridTemplateColumns, selectedRowIds, toggleRowSelection, visibleHeaders],
  );
  const renderVirtualRow = useCallback(
    ({ index, style, data }: ListChildComponentProps<ViewerVirtualRowData>) => {
      const row = data.rows[index];
      const selected = data.selectedRowIds.has(row.__rowId);
      return (
        <div style={style}>
          <div
            className={`grid h-[48px] items-center border-t border-border px-0 hover:bg-muted/50 ${selected ? "bg-primary/10" : ""}`}
            style={{ gridTemplateColumns: data.gridTemplateColumns }}
          >
            <div className="px-3">
              <Checkbox
                checked={selected}
                onCheckedChange={() => data.onToggleRowSelection(row.__rowId)}
              />
            </div>
            <div className="px-3 text-muted-foreground">{row.__rowId + 1}</div>
            {data.visibleHeaders.map((header) => (
              <div
                key={`${row.__rowId}-${header}`}
                className="truncate whitespace-nowrap px-3 text-foreground"
                title={String(row[header] ?? "-")}
              >
                {row[header] ?? "-"}
              </div>
            ))}
          </div>
        </div>
      );
    },
    [],
  );

  useEffect(() => {
    setSelectedRowIds((prev) => {
      if (prev.size === 0) return prev;
      const availableIds = new Set(rows.map((r) => r.__rowId));
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (availableIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [rows]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => onNavigate("saved")} data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{importName}</h1>
              <p className="text-sm text-muted-foreground">{rows.length} data rows</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {rows.length > 0 && (
              <>
                <Popover open={showColumnSelector} onOpenChange={setShowColumnSelector}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" data-testid="button-column-selector">
                      <Columns className="w-4 h-4 mr-2" />
                      Columns ({selectedColumns.size}/{headers.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64" align="end">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">Select Columns</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={selectAllColumns} data-testid="button-select-all-columns">
                            All
                          </Button>
                          <Button variant="ghost" size="sm" onClick={deselectAllColumns} data-testid="button-deselect-columns">
                            Min
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {headers.map((header) => (
                          <div key={header} className="flex items-center gap-2">
                            <Checkbox
                              id={`col-${header}`}
                              checked={selectedColumns.has(header)}
                              onCheckedChange={() => toggleColumn(header)}
                              data-testid={`checkbox-column-${header}`}
                            />
                            <Label htmlFor={`col-${header}`} className="text-sm cursor-pointer">
                              {header}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button
                  variant={showFilters ? "default" : "outline"}
                  onClick={() => setShowFilters(!showFilters)}
                  data-testid="button-toggle-filters"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filters {columnFilters.length > 0 && `(${columnFilters.length})`}
                </Button>

                <Button
                  variant="outline"
                  onClick={clearAllData}
                  disabled={rows.length === 0}
                  className="text-destructive"
                  data-testid="button-clear-all"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              </>
            )}

            {isSuperuser && rows.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" disabled={rows.length === 0 || exportingPdf} data-testid="button-export-menu">
                    {exportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    Export
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground px-2 pb-1">CSV Export</p>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => exportToCSV(false, false)}
                      data-testid="button-export-csv-all"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      All Data ({rows.length} rows)
                    </Button>
                    {(columnFilters.length > 0 || search) && filteredRows.length !== rows.length && (
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => exportToCSV(true, false)}
                        data-testid="button-export-csv-filtered"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Filtered ({filteredRows.length} rows)
                      </Button>
                    )}
                    {selectedRowIds.size > 0 && (
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => exportToCSV(true, true)}
                        data-testid="button-export-csv-selected"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Selected ({selectedRowIds.size} rows)
                      </Button>
                    )}
                    <div className="border-t my-2" />
                    <p className="text-xs font-medium text-muted-foreground px-2 pb-1">PDF Export</p>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => exportToPDF(false, false)}
                      disabled={exportingPdf}
                      data-testid="button-export-pdf-all"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      All Data ({rows.length} rows)
                    </Button>
                    {(columnFilters.length > 0 || search) && filteredRows.length !== rows.length && (
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => exportToPDF(true, false)}
                        disabled={exportingPdf}
                        data-testid="button-export-pdf-filtered"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Filtered ({filteredRows.length} rows)
                      </Button>
                    )}
                    {selectedRowIds.size > 0 && (
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => exportToPDF(true, true)}
                        disabled={exportingPdf}
                        data-testid="button-export-pdf-selected"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Selected ({selectedRowIds.size} rows)
                      </Button>
                    )}
                    <div className="border-t my-2" />
                    <p className="text-xs font-medium text-muted-foreground px-2 pb-1">Excel Export</p>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => exportToExcel(false, false)}
                      data-testid="button-export-excel-all"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      All Data ({rows.length} rows)
                    </Button>
                    {(columnFilters.length > 0 || search) && filteredRows.length !== rows.length && (
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => exportToExcel(true, false)}
                        data-testid="button-export-excel-filtered"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Filtered ({filteredRows.length} rows)
                      </Button>
                    )}
                    {selectedRowIds.size > 0 && (
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => exportToExcel(true, true)}
                        data-testid="button-export-excel-selected"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Selected ({selectedRowIds.size} rows)
                      </Button>
                    )}
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs text-muted-foreground px-2">
                        Columns: {selectedColumns.size} of {headers.length}
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {rows.length > 0 && showFilters && (
          <div className="glass-wrapper p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-foreground">Column Filters</h3>
              <div className="flex gap-2">
                {columnFilters.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-filters">
                    <X className="w-4 h-4 mr-1" />
                    Clear All
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={addFilter} data-testid="button-add-filter">
                  Add Filter
                </Button>
              </div>
            </div>

            {columnFilters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active filters. Click "Add Filter" to add one.</p>
            ) : (
              <div className="space-y-3">
                {columnFilters.map((filter, index) => (
                  <div key={index} className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={filter.column}
                      onValueChange={(value) => updateFilter(index, "column", value)}
                    >
                      <SelectTrigger className="w-40" data-testid={`select-filter-column-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={filter.operator}
                      onValueChange={(value) => updateFilter(index, "operator", value)}
                    >
                      <SelectTrigger className="w-32" data-testid={`select-filter-operator-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="startsWith">Starts With</SelectItem>
                        <SelectItem value="endsWith">Ends With</SelectItem>
                        <SelectItem value="notEquals">Not Equals</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      value={filter.value}
                      onChange={(e) => updateFilter(index, "value", e.target.value)}
                      placeholder="Value..."
                      className="flex-1 min-w-32"
                      data-testid={`input-filter-value-${index}`}
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFilter(index)}
                      data-testid={`button-remove-filter-${index}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="glass-wrapper p-4 mb-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
            <Button variant="ghost" onClick={() => onNavigate("saved")} className="ml-auto">
              Back to Saved Imports
            </Button>
          </div>
        )}

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
            {emptyHint && (
              <p className="text-sm text-muted-foreground mt-2">{emptyHint}</p>
            )}
          </div>
        ) : (
          <div className="glass-wrapper p-6">
            <div className="mb-4 flex items-center gap-4 flex-wrap">
              {rows.length > 0 && (
                <>
                  <div className="relative flex-1 min-w-48 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setCurrentPage(1); // 🔥 reset page bila search berubah
                      }}
                      placeholder="Search..."
                      className="pl-9"
                      data-testid="input-search-viewer"
                    />
                  </div>
                  {(columnFilters.length > 0 || search) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Filter className="w-4 h-4" />
                      <span>
                        {filteredRows.length} results of {rows.length}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              {enableVirtualRows ? (
                <div style={{ minWidth: `${virtualTableMinWidth}px` }}>
                  <div className="sticky top-0 z-10 border-b border-border bg-muted">
                    <div
                      className="grid h-12 items-center"
                      style={{ gridTemplateColumns }}
                    >
                      <div className="px-3">
                        <Checkbox
                          checked={selectAllFiltered && filteredRows.length > 0}
                          onCheckedChange={toggleSelectAllFiltered}
                          data-testid="checkbox-select-all-rows"
                        />
                      </div>
                      <div className="px-3 font-medium text-muted-foreground">#</div>
                      {visibleHeaders.map((header, idx) => (
                        <div key={idx} className="truncate whitespace-nowrap px-3 font-medium text-muted-foreground">
                          {header}
                        </div>
                      ))}
                    </div>
                  </div>
                  <FixedSizeList
                    height={viewportHeightPx}
                    itemCount={filteredRows.length}
                    itemSize={rowHeightPx}
                    itemData={virtualRowData}
                    width="100%"
                    overscanCount={10}
                  >
                    {renderVirtualRow}
                  </FixedSizeList>
                </div>
              ) : (
                <div className="max-h-[560px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr>
                        <th className="w-10 p-3 text-left font-medium text-muted-foreground">
                          <Checkbox
                            checked={selectAllFiltered && filteredRows.length > 0}
                            onCheckedChange={toggleSelectAllFiltered}
                            data-testid="checkbox-select-all-rows"
                          />
                        </th>
                        <th className="w-12 p-3 text-left font-medium text-muted-foreground">#</th>
                        {visibleHeaders.map((header, idx) => (
                          <th key={idx} className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr
                          key={row.__rowId}
                          className={`h-[48px] border-t border-border hover:bg-muted/50 ${selectedRowIds.has(row.__rowId) ? "bg-primary/10" : ""}`}
                        >
                          <td className="p-3">
                            <Checkbox
                              checked={selectedRowIds.has(row.__rowId)}
                              onCheckedChange={() => toggleRowSelection(row.__rowId)}
                            />
                          </td>
                          <td className="p-3 text-muted-foreground">{row.__rowId + 1}</td>
                          {visibleHeaders.map((header) => (
                            <td
                              key={header}
                              className="max-w-[300px] truncate whitespace-nowrap p-3 text-foreground"
                              title={String(row[header] ?? "-")}
                            >
                              {row[header] ?? "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* 🔒 MIN SEARCH LENGTH UX MESSAGE */}
              {debouncedSearch &&
                debouncedSearch.length < MIN_SEARCH_LENGTH && (
                  <div className="p-6 text-center text-muted-foreground">
                    Type at least {MIN_SEARCH_LENGTH} characters to search
                  </div>
                )}

              {/* 🔍 NO RESULT MESSAGE */}
              {debouncedSearch &&
                debouncedSearch.length >= MIN_SEARCH_LENGTH &&
                filteredRows.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground">
                    No results found
                  </div>
                )}
            </div>

            {filteredRows.length > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground flex-wrap gap-2">
                <span>
                  Showing{" "}
                  {isFiltering ? filteredRows.length : rows.length}
                  {" of "}
                  {totalRows} rows
                  {selectedRowIds.size > 0 && ` (${selectedRowIds.size} selected)`}
                </span>
                <div className="flex items-center gap-2">
                  {selectedRowIds.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedRowIds(new Set());
                        setSelectAllFiltered(false);
                      }}
                      data-testid="button-clear-selection"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear Selection
                    </Button>
                  )}
                  {!isServerSearchActive && hasMore && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMore}
                      disabled={loadingMore}
                      data-testid="button-load-more"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>Load More ({totalRows - rows.length} remaining)</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
