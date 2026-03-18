import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SearchResultRow } from "@/pages/general-search/types";
import { getCellDisplayText, getPriorityRank, highlightMatch } from "@/pages/general-search/utils";

interface GeneralSearchResultsProps {
  advancedMode: boolean;
  canExport: boolean;
  currentPage: number;
  exportingPdf: boolean;
  filtersCount: number;
  headers: string[];
  isLowSpecMode: boolean;
  loading: boolean;
  logic: "AND" | "OR";
  onExportCsv: () => void;
  onExportPdf: () => void;
  onPageChange: (page: number) => void;
  onRecordSelect: (record: SearchResultRow) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  pageSizeOptions: number[];
  query: string;
  results: SearchResultRow[];
  resultsPerPage: number;
  totalResults: number;
}

export function GeneralSearchResults({
  advancedMode,
  canExport,
  currentPage,
  exportingPdf,
  filtersCount,
  headers,
  isLowSpecMode,
  loading,
  logic,
  onExportCsv,
  onExportPdf,
  onPageChange,
  onRecordSelect,
  onRowsPerPageChange,
  pageSizeOptions,
  query,
  results,
  resultsPerPage,
  totalResults,
}: GeneralSearchResultsProps) {
  const [tableScrollTop, setTableScrollTop] = useState(0);

  useEffect(() => {
    setTableScrollTop(0);
  }, [currentPage, results, resultsPerPage]);

  const enableVirtualRows = isLowSpecMode && results.length > 40;
  const rowHeightPx = 52;
  const viewportHeightPx = 540;
  const overscanRows = 8;
  const virtualStartRow = enableVirtualRows
    ? Math.max(0, Math.floor(tableScrollTop / rowHeightPx) - overscanRows)
    : 0;
  const virtualVisibleRows = enableVirtualRows
    ? Math.ceil(viewportHeightPx / rowHeightPx) + overscanRows * 2
    : results.length;
  const virtualEndRow = enableVirtualRows
    ? Math.min(results.length, virtualStartRow + virtualVisibleRows)
    : results.length;
  const virtualRows = enableVirtualRows
    ? results.slice(virtualStartRow, virtualEndRow)
    : results;
  const topSpacerHeight = enableVirtualRows ? virtualStartRow * rowHeightPx : 0;
  const bottomSpacerHeight = enableVirtualRows ? Math.max(0, (results.length - virtualEndRow) * rowHeightPx) : 0;
  const totalPages = Math.ceil(totalResults / resultsPerPage);

  const pageButtons = useMemo(
    () =>
      Array.from({ length: totalPages }).map((_, index) => {
        const pageNumber = index + 1;
        const isVisible =
          pageNumber === 1 ||
          pageNumber === totalPages ||
          (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1);

        if (!isVisible) {
          if (pageNumber === currentPage - 2) {
            return <span key={pageNumber} className="text-muted-foreground">...</span>;
          }
          return null;
        }

        return (
          <Button
            key={pageNumber}
            variant={currentPage === pageNumber ? "default" : "outline"}
            size="sm"
            onClick={() => onPageChange(pageNumber)}
            disabled={loading}
            className="w-8"
            data-testid={`button-page-${pageNumber}`}
          >
            {pageNumber}
          </Button>
        );
      }),
    [currentPage, loading, onPageChange, totalPages],
  );

  if (results.length === 0) {
    return (
      <div className="glass-wrapper p-6">
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
            <p><strong>Troubleshooting:</strong></p>
            <ul className="inline-block text-left">
              <li>Verify data has been imported in the "Import Data" tab</li>
              <li>Check that your search query is at least 2 characters</li>
              <li>Try searching for different values</li>
              <li>In advanced mode, ensure filters are correctly configured</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-wrapper p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-foreground font-medium">{results.length} results found</p>
          {advancedMode ? (
            <p className="text-sm text-muted-foreground">
              {filtersCount} active filters with {logic} logic
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select value={String(resultsPerPage)} onValueChange={(value) => onRowsPerPageChange(Number(value))}>
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
          {canExport ? (
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
                    onClick={onExportCsv}
                    data-testid="button-export-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={onExportPdf}
                    disabled={exportingPdf}
                    data-testid="button-export-pdf"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </div>

      <div
        className="overflow-x-auto overflow-y-auto rounded-lg border border-border max-h-[600px] scrollbar-visible"
        onScroll={enableVirtualRows ? (event) => setTableScrollTop(event.currentTarget.scrollTop) : undefined}
      >
        <style>{`
          .scrollbar-visible {
            -ms-overflow-style: auto;
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
              {headers.map((header, index) => (
                <th key={index} className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enableVirtualRows && topSpacerHeight > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={headers.length + 2} style={{ height: `${topSpacerHeight}px`, padding: 0 }} />
              </tr>
            ) : null}
            {virtualRows.map((row, rowIndex) => {
              const actualRowIndex = enableVirtualRows ? virtualStartRow + rowIndex : rowIndex;

              return (
                <tr key={actualRowIndex} className="border-t border-border hover:bg-muted/50 h-[52px]">
                  <td className="p-3 text-muted-foreground">{actualRowIndex + 1}</td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRecordSelect(row)}
                      data-testid={`button-view-${actualRowIndex}`}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                  </td>
                  {headers.map((header) => {
                    const safeText = getCellDisplayText(row?.[header]);
                    return (
                      <td
                        key={`${actualRowIndex}-${header}`}
                        className={`p-3 text-foreground max-w-[280px] truncate whitespace-nowrap ${
                          getPriorityRank(header) <= 2 ? "font-semibold" : ""
                        }`}
                        title={safeText}
                      >
                        {advancedMode || isLowSpecMode ? safeText : highlightMatch(safeText, query)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {enableVirtualRows && bottomSpacerHeight > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={headers.length + 2} style={{ height: `${bottomSpacerHeight}px`, padding: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          Showing {results.length > 0 ? (currentPage - 1) * resultsPerPage + 1 : 0} - {Math.min(currentPage * resultsPerPage, totalResults)} of {totalResults} results
        </p>

        {totalResults > resultsPerPage ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">{pageButtons}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
