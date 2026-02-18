import { useState, useEffect } from "react";
import { Search, Download, AlertCircle, FileText, Plus, X, Filter, ChevronDown, ChevronUp, RotateCcw, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import jsPDF from "jspdf";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { searchData, advancedSearchData, getSearchColumns, type SearchFilter } from "@/lib/api";

const OPERATORS = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Not equals" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "greaterThan", label: "Greater than" },
  { value: "lessThan", label: "Less than" },
  { value: "greaterThanOrEqual", label: "Greater than or equal" },
  { value: "lessThanOrEqual", label: "Less than or equal" },
  { value: "isEmpty", label: "Is empty" },
  { value: "isNotEmpty", label: "Is not empty" },
];

interface FilterRow {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface GeneralSearchProps {
  userRole?: string;
}

export default function GeneralSearch({ userRole }: GeneralSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [resultsPerPage, setResultsPerPage] = useState(50);
  const [selectedRecord, setSelectedRecord] = useState<Record<string, any> | null>(null);

  const [advancedMode, setAdvancedMode] = useState(false);
  const [filters, setFilters] = useState<FilterRow[]>([
    { id: "1", field: "", operator: "contains", value: "" },
  ]);
  const [logic, setLogic] = useState<"AND" | "OR">("AND");
  const [columns, setColumns] = useState<string[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const canSeeSourceFile = userRole === "superuser" || userRole === "admin";
  const pageSizeOptions = [25, 50, 100, 200];
  const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const getPriorityRank = (key: string): number => {
    const k = normalizeKey(key);
    if (/(ic|mykad|nric|no?kp|kadpengenalan)/.test(k)) return 0;
    if (/(fullname|namapenuh|nama)/.test(k)) return 1;
    if (/(account|akaun|acct|accno|accountno)/.test(k)) return 2;
    if (/(card|kad|cardno)/.test(k)) return 3;
    if (/(address|alamat|addr|residential|homeaddress|officeaddress)/.test(k)) return 4;
    if (/(phone|telefon|tel|hp|handphone|mobile)/.test(k)) return 5;
    if (/(age|umur)/.test(k)) return 6;
    return 999;
  };
  const orderHeaders = (allHeaders: string[]) => {
    const headers = [...allHeaders];
    const sourceIndex = headers.indexOf("Source File");
    if (sourceIndex >= 0) headers.splice(sourceIndex, 1);

    headers.sort((a, b) => {
      const ra = getPriorityRank(a);
      const rb = getPriorityRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });

    if (canSeeSourceFile) {
      headers.push("Source File");
    }
    return headers;
  };

  useEffect(() => {
    if (advancedMode && columns.length === 0) {
      loadColumns();
    }
  }, [advancedMode]);

  const loadColumns = async () => {
    setLoadingColumns(true);
    try {
      const response = await getSearchColumns();
      setColumns(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error("Failed to load columns:", err);
    } finally {
      setLoadingColumns(false);
    }
  };

  const handleSimpleSearch = async (pageNum: number = 1) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setError("Please enter at least 2 characters.");
      return;
    }

    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const response = await searchData(trimmed, pageNum, resultsPerPage);
      const results = response.results || response.rows || [];
      setTotalResults(response.total || results.length);
      setCurrentPage(pageNum);

      if (results.length > 0) {
        const allHeaders = Array.from(
          new Set(
            results.flatMap((row: Record<string, any>) =>
              Object.keys(row).filter(k => !k.startsWith("_"))
            )
          )
        ).sort() as string[];

        const filteredHeaders = canSeeSourceFile
          ? allHeaders
          : allHeaders.filter((h) => h !== "Source File");
        setHeaders(orderHeaders(filteredHeaders));
      } else {
        setHeaders([]);
      }

      setResults(results);
    } catch (err: any) {
      setError(err?.message || "Failed to search data.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdvancedSearch = async (pageNum: number = 1) => {
    const validFilters = filters.filter(
      f => f.field && (f.operator === "isEmpty" || f.operator === "isNotEmpty" || f.value.trim())
    );

    if (validFilters.length === 0) {
      setError("Please add at least one valid filter.");
      return;
    }

    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const response = await advancedSearchData(validFilters, logic, pageNum, resultsPerPage);
      const results = response.results || response.rows || [];
      setTotalResults(response.total || results.length);
      setCurrentPage(pageNum);

      if (results.length > 0) {
        const allHeaders = Array.from(
          new Set(
            results.flatMap((row: Record<string, any>) =>
              Object.keys(row).filter(k => !k.startsWith("_"))
            )
          )
        ).sort() as string[];

        const filteredHeaders = canSeeSourceFile
          ? allHeaders
          : allHeaders.filter((h) => h !== "Source File");
        setHeaders(orderHeaders(filteredHeaders));
      } else {
        setHeaders([]);
      }

      setResults(results);
    } catch (err: any) {
      setError(err?.message || "Advanced search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    if (advancedMode) {
      handleAdvancedSearch(1);
    } else {
      handleSimpleSearch(1);
    }
  };

  const handlePageChange = (pageNum: number) => {
    if (advancedMode) {
      handleAdvancedSearch(pageNum);
    } else {
      handleSimpleSearch(pageNum);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (e.target.value.trim().length === 0) {
      setResults([]);
      setHeaders([]);
      setSearched(false);
      setError("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const addFilter = () => {
    setFilters([
      ...filters,
      { id: Date.now().toString(), field: "", operator: "contains", value: "" },
    ]);
  };

  const removeFilter = (id: string) => {
    if (filters.length > 1) {
      setFilters(filters.filter((f) => f.id !== id));
    }
  };

  const updateFilter = (id: string, updates: Partial<FilterRow>) => {
    setFilters(filters.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const exportToCSV = () => {
    if (results.length === 0) return;

    const csvContent = [
      headers.join(","),
      ...results.map((row) =>
        headers.map((h) => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `SQR-search-results-${advancedMode ? "advanced" : query}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const exportToPDF = async () => {
    if (results.length === 0) return;

    setExportingPdf(true);
    try {
      const isDark = document.documentElement.classList.contains("dark");

      const pdf = new jsPDF({
        orientation: headers.length > 5 ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      let yPos = margin;

      pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");

      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(isDark ? 255 : 30);
      pdf.text("Search Results Report", margin, yPos + 6);
      yPos += 12;

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(isDark ? 180 : 100);
      const searchInfo = advancedMode ? `Advanced Search (${getActiveFiltersCount()} filters)` : `Search: "${query}"`;
      pdf.text(`${searchInfo} | ${results.length} results | Generated: ${new Date().toLocaleString()}`, margin, yPos);
      yPos += 8;

      pdf.setDrawColor(isDark ? 100 : 200);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 6;

      const colWidth = (pageWidth - margin * 2) / headers.length;
      const rowHeight = 7;
      const maxRowsPerPage = Math.floor((pageHeight - yPos - 20) / rowHeight);

      pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
      pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(isDark ? 255 : 30);
      headers.forEach((header, i) => {
        const text = header.length > 15 ? header.substring(0, 12) + "..." : header;
        pdf.text(text, margin + i * colWidth + 2, yPos + 5);
      });
      yPos += rowHeight;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      let rowsOnPage = 0;
      let pageNum = 1;

      results.forEach((row, rowIndex) => {
        if (rowsOnPage >= maxRowsPerPage - 1) {
          pdf.setFontSize(8);
          pdf.setTextColor(isDark ? 120 : 150);
          pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
          pdf.text("SQR System", margin, pageHeight - 8);

          pdf.addPage();
          pageNum++;
          yPos = margin;
          rowsOnPage = 0;

          pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
          pdf.rect(0, 0, pageWidth, pageHeight, "F");

          pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
          pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(isDark ? 255 : 30);
          headers.forEach((header, i) => {
            const text = header.length > 15 ? header.substring(0, 12) + "..." : header;
            pdf.text(text, margin + i * colWidth + 2, yPos + 5);
          });
          yPos += rowHeight;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7);
        }

        if (rowIndex % 2 === 0) {
          pdf.setFillColor(isDark ? 40 : 245, isDark ? 50 : 245, isDark ? 60 : 250);
          pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
        }

        pdf.setTextColor(isDark ? 220 : 50);
        headers.forEach((header, i) => {
          const cellValue = String(row[header] || "");
          const maxChars = Math.floor(colWidth / 2);
          const text = cellValue.length > maxChars ? cellValue.substring(0, maxChars - 2) + ".." : cellValue;
          pdf.text(text, margin + i * colWidth + 2, yPos + 5);
        });
        yPos += rowHeight;
        rowsOnPage++;
      });

      pdf.setFontSize(8);
      pdf.setTextColor(isDark ? 120 : 150);
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
      pdf.text("SQR System", margin, pageHeight - 8);

      pdf.save(`SQR-search-results-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error: any) {
      console.error("Failed to export PDF:", error);
      alert("Failed to export PDF: " + (error?.message || "Unknown error"));
    } finally {
      setExportingPdf(false);
    }
  };

  const getActiveFiltersCount = () => {
    return filters.filter(
      (f) => f.field && (f.operator === "isEmpty" || f.operator === "isNotEmpty" || f.value.trim())
    ).length;
  };

  const handleReset = () => {
    setQuery("");
    setResults([]);
    setHeaders([]);
    setError("");
    setSearched(false);
    setFilters([{ id: "1", field: "", operator: "contains", value: "" }]);
    setLogic("AND");
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Data Search</h1>
          <p className="text-muted-foreground">Search information in all imported data</p>
        </div>

        <div className="glass-wrapper p-6 mb-6">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Button
              variant={advancedMode ? "outline" : "default"}
              size="sm"
              onClick={() => setAdvancedMode(false)}
              data-testid="button-simple-search"
            >
              <Search className="w-4 h-4 mr-2" />
              Simple Search
            </Button>
            <Button
              variant={advancedMode ? "default" : "outline"}
              size="sm"
              onClick={() => setAdvancedMode(true)}
              data-testid="button-advanced-search"
            >
              <Filter className="w-4 h-4 mr-2" />
              Advanced Search
              {getActiveFiltersCount() > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {getActiveFiltersCount()}
                </Badge>
              )}
            </Button>
          </div>

          {!advancedMode ? (
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={handleQueryChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter IC No., name, or other keywords..."
                  className="pl-10 h-12 text-base"
                  data-testid="input-search"
                />
              </div>
              <Button onClick={handleSearch} disabled={loading} className="h-12 px-6" data-testid="button-search">
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Searching...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    Search
                  </div>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleReset}
                className="h-12 px-6"
                data-testid="button-reset"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">Combine filters with:</span>
                <div className="flex gap-2">
                  <Button
                    variant={logic === "AND" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLogic("AND")}
                    data-testid="button-logic-and"
                  >
                    AND
                  </Button>
                  <Button
                    variant={logic === "OR" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLogic("OR")}
                    data-testid="button-logic-or"
                  >
                    OR
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {filters.map((filter, index) => (
                  <div
                    key={filter.id}
                    className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg flex-wrap"
                    data-testid={`filter-row-${index}`}
                  >
                    <span className="text-sm text-muted-foreground w-8 shrink-0">
                      {index === 0 ? "Where" : logic === "AND" ? "AND" : "OR"}
                    </span>

                    <Select
                      value={filter.field}
                      onValueChange={(value) => updateFilter(filter.id, { field: value })}
                    >
                      <SelectTrigger className="w-[180px]" data-testid={`select-field-${index}`}>
                        <SelectValue placeholder="Select field..." />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingColumns ? (
                          <SelectItem value="loading" disabled>
                            Loading...
                          </SelectItem>
                        ) : columns.length === 0 ? (
                          <SelectItem value="empty" disabled>
                            No fields available
                          </SelectItem>
                        ) : (
                          columns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>

                    <Select
                      value={filter.operator}
                      onValueChange={(value) => updateFilter(filter.id, { operator: value })}
                    >
                      <SelectTrigger className="w-[180px]" data-testid={`select-operator-${index}`}>
                        <SelectValue placeholder="Operator..." />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {filter.operator !== "isEmpty" && filter.operator !== "isNotEmpty" && (
                      <Input
                        value={filter.value}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                        placeholder="Value..."
                        className="flex-1 min-w-[150px]"
                        data-testid={`input-value-${index}`}
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFilter(filter.id)}
                      disabled={filters.length === 1}
                      className="shrink-0"
                      data-testid={`button-remove-filter-${index}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="outline" size="sm" onClick={addFilter} data-testid="button-add-filter">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Filter
                </Button>

                <div className="flex-1" />

                <Button onClick={handleSearch} disabled={loading} data-testid="button-search-advanced">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Searching...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      Search
                    </div>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  data-testid="button-reset-advanced"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        {searched && !loading && (
          <div className="glass-wrapper p-6">
            {results.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-foreground font-medium mb-2">No results found</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {advancedMode
                    ? "Try changing your filters, use different operators, or check if data has been imported."
                    : "Try different keywords or check your spelling. Make sure data has been imported first."}
                </p>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <p>📌 <strong>Troubleshooting:</strong></p>
                  <ul className="inline-block text-left">
                    <li>• Verify data has been imported in the &quot;Import Data&quot; tab</li>
                    <li>• Check that your search query is at least 2 characters</li>
                    <li>• Try searching for different values</li>
                    <li>• In advanced mode, ensure filters are correctly configured</li>
                  </ul>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <p className="text-foreground font-medium">
                      {results.length} results found
                    </p>
                    {advancedMode && (
                      <p className="text-sm text-muted-foreground">
                        {getActiveFiltersCount()} active filters with {logic} logic
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Rows per page</span>
                      <Select
                        value={String(resultsPerPage)}
                        onValueChange={(value) => {
                          const nextSize = Number(value);
                          setResultsPerPage(nextSize);
                          setCurrentPage(1);
                          if (advancedMode) {
                            handleAdvancedSearch(1);
                          } else {
                            handleSimpleSearch(1);
                          }
                        }}
                      >
                        <SelectTrigger className="w-[110px]" data-testid="select-rows-per-page">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {pageSizeOptions.map((size) => (
                            <SelectItem key={size} value={String(size)}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  {userRole === "superuser" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" disabled={exportingPdf} data-testid="button-export">
                          {exportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                          Export
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48" align="end">
                        <div className="space-y-1">
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={exportToCSV}
                            data-testid="button-export-csv"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={exportToPDF}
                            disabled={exportingPdf}
                            data-testid="button-export-pdf"
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Export PDF
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  </div>
                </div>

                <div className="overflow-x-auto overflow-y-auto rounded-lg border border-border max-h-[600px] scrollbar-visible">
                  <style>{`
                    .scrollbar-visible {
                      scrollbar-width: thin;
                      scrollbar-color: rgba(99, 102, 241, 0.5) rgba(31, 41, 55, 0.1);
                    }
                    .scrollbar-visible::-webkit-scrollbar {
                      width: 8px;
                      height: 8px;
                    }
                    .scrollbar-visible::-webkit-scrollbar-track {
                      background: rgba(31, 41, 55, 0.1);
                      border-radius: 4px;
                    }
                    .scrollbar-visible::-webkit-scrollbar-thumb {
                      background: rgba(99, 102, 241, 0.5);
                      border-radius: 4px;
                    }
                    .scrollbar-visible::-webkit-scrollbar-thumb:hover {
                      background: rgba(99, 102, 241, 0.8);
                    }
                  `}</style>
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                        {headers.map((header, idx) => (
                          <th
                            key={idx}
                            className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-t border-border hover:bg-muted/50">
                          <td className="p-3 text-muted-foreground">{rowIdx + 1}</td>
                          <td className="p-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedRecord(row)}
                              data-testid={`button-view-${rowIdx}`}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </Button>
                          </td>
                          {headers.map((header, colIdx) => (
                            <td
                              key={colIdx}
                              className={`p-3 text-foreground ${
                                getPriorityRank(header) <= 2 ? "font-semibold" : ""
                              }`}
                            >
                              {(() => {
                                const rawValue = row?.[header];

                                const safeText =
                                  typeof rawValue === "string"
                                    ? rawValue
                                    : rawValue === null || rawValue === undefined
                                      ? "-"
                                      : Array.isArray(rawValue)
                                        ? rawValue.join(", ")
                                        : typeof rawValue === "object"
                                          ? JSON.stringify(rawValue)
                                          : String(rawValue);

                                return advancedMode
                                  ? safeText
                                  : highlightMatch(safeText, query);
                              })()}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
                  <p className="text-sm text-muted-foreground">
                    Showing {results.length > 0 ? (currentPage - 1) * resultsPerPage + 1 : 0} - {Math.min(currentPage * resultsPerPage, totalResults)} of {totalResults} results
                  </p>

                  {totalResults > resultsPerPage && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1 || loading}
                        data-testid="button-prev-page"
                      >
                        ← Previous
                      </Button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.ceil(totalResults / resultsPerPage) }).map(
                          (_, i) => {
                            const pageNum = i + 1;
                            const isVisible =
                              pageNum === 1 ||
                              pageNum === Math.ceil(totalResults / resultsPerPage) ||
                              (pageNum >= currentPage - 1 && pageNum <= currentPage + 1);

                            if (!isVisible) {
                              if (pageNum === currentPage - 2) {
                                return <span key={pageNum} className="text-muted-foreground">...</span>;
                              }
                              return null;
                            }

                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePageChange(pageNum)}
                                disabled={loading}
                                className="w-8"
                                data-testid={`button-page-${pageNum}`}
                              >
                                {pageNum}
                              </Button>
                            );
                          }
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= Math.ceil(totalResults / resultsPerPage) || loading}
                        data-testid="button-next-page"
                      >
                        Next →
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {!searched && (
          <div className="glass-wrapper p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-primary" />
            </div>
            <p className="text-foreground font-medium mb-2">Start Search</p>
            <p className="text-sm text-muted-foreground mb-4">
              {advancedMode
                ? "Add filters to search data with specific criteria."
                : "Enter IC number, name, or keywords to search in all data."}
            </p>
          </div>
        )}
      </div>

      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent className="w-[95vw] max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Details</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <Card className="border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm tracking-widest text-muted-foreground">INFORMATION</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.keys(selectedRecord).map((key) => {
                    if (key.startsWith("_")) return null;
                    if (key === "__rowId") return null;
                    if (!canSeeSourceFile && key === "Source File") return null;

                    const raw = selectedRecord[key];
                    const value =
                      typeof raw === "string"
                        ? raw
                        : raw === null || raw === undefined
                          ? "-"
                          : Array.isArray(raw)
                            ? raw.join(", ")
                            : typeof raw === "object"
                              ? JSON.stringify(raw)
                              : String(raw);

                    const isImportant =
                      /name|ic|id|passport|no\.?|nric|kad|pengenalan/i.test(key);

                    return (
                      <div key={key} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                        <div className="text-xs text-muted-foreground">{key}</div>
                        <div className={`mt-1 text-sm ${isImportant ? "font-semibold text-foreground" : "text-foreground"}`}>
                          {value || "-"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function highlightMatch(text: string, query: string): JSX.Element {
  if (!query) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
