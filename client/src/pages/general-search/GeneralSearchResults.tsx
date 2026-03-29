import { useEffect, useMemo, useState } from "react";
import { Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { GeneralSearchExportMenu } from "@/pages/general-search/GeneralSearchExportMenu";
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
  const isMobile = useIsMobile();
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
  const rangeStart = totalResults > 0 ? (currentPage - 1) * resultsPerPage + 1 : 0;
  const rangeEnd = Math.min(currentPage * resultsPerPage, totalResults);

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

  const renderCellValue = (safeText: string) =>
    advancedMode || isLowSpecMode ? safeText : highlightMatch(safeText, query);

  const getRowHeadersWithContent = (row: SearchResultRow) => {
    const populatedHeaders = headers.filter((header) => {
      const safeText = getCellDisplayText(row?.[header]).trim();
      return safeText !== "" && safeText !== "-";
    });

    return populatedHeaders.length > 0 ? populatedHeaders : headers;
  };

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
    <div className="glass-wrapper p-4 sm:p-6" data-floating-ai-avoid="true">
      <div className={`mb-4 gap-3 ${isMobile ? "space-y-3" : "flex flex-wrap items-center justify-between"}`}>
        <div className="min-w-0">
          <p className="text-foreground font-medium">
            {totalResults} result{totalResults === 1 ? "" : "s"} found
          </p>
          {advancedMode ? (
            <p className="text-sm text-muted-foreground">
              {filtersCount} active filters with {logic} logic
            </p>
          ) : null}
        </div>
        <div className={`gap-2 ${isMobile ? "grid grid-cols-1" : "flex items-center flex-wrap"}`}>
          <div className={`text-sm text-muted-foreground ${isMobile ? "grid grid-cols-1 gap-2" : "flex items-center gap-2"}`}>
            <span>Rows per page</span>
            <Select value={String(resultsPerPage)} onValueChange={(value) => onRowsPerPageChange(Number(value))}>
              <SelectTrigger className={isMobile ? "h-10 w-full" : "w-[110px]"} data-testid="select-rows-per-page">
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
            <GeneralSearchExportMenu
              exportingPdf={exportingPdf}
              totalResults={totalResults}
              visibleResultsCount={results.length}
              onExportCsv={onExportCsv}
              onExportPdf={onExportPdf}
            />
          ) : null}
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-3">
          {results.map((row, rowIndex) => {
            const resultNumber = rangeStart + rowIndex;
            const populatedHeaders = getRowHeadersWithContent(row);
            const headlineHeader = populatedHeaders[0];
            const subheadlineHeader = populatedHeaders[1];
            const visibleDetailHeaders = populatedHeaders.slice(2, 6);
            const overflowHeaders = populatedHeaders.slice(6);
            const headlineValue = headlineHeader ? getCellDisplayText(row?.[headlineHeader]) : "-";
            const subheadlineValue = subheadlineHeader ? getCellDisplayText(row?.[subheadlineHeader]) : "";

            return (
              <article
                key={`mobile-result-${resultNumber}`}
                className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Result {resultNumber}
                    </p>
                    <div className="break-words text-base font-semibold text-foreground">
                      {renderCellValue(headlineValue)}
                    </div>
                    {subheadlineHeader && subheadlineValue && subheadlineValue !== "-" ? (
                      <p className="break-words text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{subheadlineHeader}:</span>{" "}
                        {renderCellValue(subheadlineValue)}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRecordSelect(row)}
                    className="h-10 shrink-0 px-3"
                    data-testid={`button-view-${rowIndex}`}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Button>
                </div>

                {visibleDetailHeaders.length > 0 ? (
                  <dl className="mt-3 space-y-2">
                    {visibleDetailHeaders.map((header) => {
                      const safeText = getCellDisplayText(row?.[header]);
                      return (
                        <div
                          key={`${resultNumber}-${header}`}
                          className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2"
                        >
                          <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            {header}
                          </dt>
                          <dd
                            className={`mt-1 break-words text-sm text-foreground ${
                              getPriorityRank(header) <= 2 ? "font-semibold" : ""
                            }`}
                          >
                            {renderCellValue(safeText)}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}

                {overflowHeaders.length > 0 ? (
                  <details className="mt-3 rounded-xl border border-border/50 bg-background/70">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-primary">
                      Show {overflowHeaders.length} more field{overflowHeaders.length === 1 ? "" : "s"}
                    </summary>
                    <dl className="space-y-2 border-t border-border/50 px-3 py-3">
                      {overflowHeaders.map((header) => {
                        const safeText = getCellDisplayText(row?.[header]);
                        return (
                          <div
                            key={`${resultNumber}-${header}-extra`}
                            className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
                          >
                            <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                              {header}
                            </dt>
                            <dd className="mt-1 break-words text-sm text-foreground">
                              {renderCellValue(safeText)}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div
          className="max-h-[600px] overflow-x-auto overflow-y-auto rounded-lg border border-border scrollbar-visible"
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
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="p-3 text-left font-medium text-muted-foreground">#</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Action</th>
                {headers.map((header, index) => (
                  <th key={index} className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enableVirtualRows && topSpacerHeight > 0 ? (
                <tr aria-hidden="true">
                  <td colSpan={headers.length + 2} height={topSpacerHeight} className="p-0" />
                </tr>
              ) : null}
              {virtualRows.map((row, rowIndex) => {
                const actualRowIndex = enableVirtualRows ? virtualStartRow + rowIndex : rowIndex;

                return (
                  <tr key={actualRowIndex} className="h-[52px] border-t border-border hover:bg-muted/50">
                    <td className="p-3 text-muted-foreground">{actualRowIndex + 1}</td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRecordSelect(row)}
                        data-testid={`button-view-${actualRowIndex}`}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Button>
                    </td>
                    {headers.map((header) => {
                      const safeText = getCellDisplayText(row?.[header]);
                      return (
                        <td
                          key={`${actualRowIndex}-${header}`}
                          className={`max-w-[280px] truncate whitespace-nowrap p-3 text-foreground ${
                            getPriorityRank(header) <= 2 ? "font-semibold" : ""
                          }`}
                          title={safeText}
                        >
                          {renderCellValue(safeText)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {enableVirtualRows && bottomSpacerHeight > 0 ? (
                <tr aria-hidden="true">
                  <td colSpan={headers.length + 2} height={bottomSpacerHeight} className="p-0" />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <div className={`mt-4 gap-3 ${isMobile ? "space-y-3" : "flex flex-wrap items-center justify-between"}`}>
        <p className="text-sm text-muted-foreground">
          Showing {rangeStart} - {rangeEnd} of {totalResults} results
        </p>

        {totalResults > resultsPerPage ? (
          isMobile ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="h-10 w-full"
                data-testid="button-prev-page"
              >
                Previous
              </Button>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-center text-sm font-medium text-foreground">
                Page {currentPage} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
                className="h-10 w-full"
                data-testid="button-next-page"
              >
                Next
              </Button>
            </div>
          ) : (
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
          )
        ) : null}
      </div>
    </div>
  );
}
