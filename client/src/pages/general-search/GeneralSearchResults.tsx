import { Suspense, useCallback, useEffect, useMemo, useState, type UIEvent } from "react";
import { FileText } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { GeneralSearchMobileResultsList } from "@/pages/general-search/GeneralSearchMobileResultsList";
import { GeneralSearchResultsPagination } from "@/pages/general-search/GeneralSearchResultsPagination";
import { GeneralSearchResultsSkeleton } from "@/pages/general-search/GeneralSearchResultsSkeleton";
import { GeneralSearchResultsToolbar } from "@/pages/general-search/GeneralSearchResultsToolbar";
import type { SearchResultRow } from "@/pages/general-search/types";
import {
  buildGeneralSearchPaginationItems,
  buildGeneralSearchResultsRange,
  buildGeneralSearchVirtualRowsState,
} from "@/pages/general-search/general-search-results-utils";
import { highlightMatch } from "@/pages/general-search/utils";

const GeneralSearchDesktopResultsTable = lazyWithPreload(() =>
  import("@/pages/general-search/GeneralSearchDesktopResultsTable").then((module) => ({
    default: module.GeneralSearchDesktopResultsTable,
  })),
);

interface GeneralSearchResultsProps {
  activeFilterSummaries: string[];
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
  activeFilterSummaries,
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

  const {
    bottomSpacerHeight,
    enableVirtualRows,
    topSpacerHeight,
    virtualEndRow,
    virtualStartRow,
  } = useMemo(
    () =>
      buildGeneralSearchVirtualRowsState(
        results.length,
        isLowSpecMode,
        tableScrollTop,
      ),
    [isLowSpecMode, results.length, tableScrollTop],
  );
  const { rangeEnd, rangeStart, totalPages } = useMemo(
    () =>
      buildGeneralSearchResultsRange(
        currentPage,
        resultsPerPage,
        totalResults,
      ),
    [currentPage, resultsPerPage, totalResults],
  );
  const pageItems = useMemo(
    () => buildGeneralSearchPaginationItems(currentPage, totalPages),
    [currentPage, totalPages],
  );
  const virtualRows = useMemo(
    () =>
      enableVirtualRows
        ? results.slice(virtualStartRow, virtualEndRow)
        : results,
    [enableVirtualRows, results, virtualEndRow, virtualStartRow],
  );

  const renderCellValue = useCallback(
    (safeText: string) => (advancedMode || isLowSpecMode ? safeText : highlightMatch(safeText, query)),
    [advancedMode, isLowSpecMode, query],
  );

  const handleDesktopTableScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!enableVirtualRows) {
      return;
    }

    setTableScrollTop(event.currentTarget.scrollTop);
  }, [enableVirtualRows]);

  if (loading && results.length === 0) {
    return <GeneralSearchResultsSkeleton />;
  }

  if (results.length === 0) {
    return (
      <div className="glass-wrapper p-6">
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mb-2 font-medium text-foreground">No results found</p>
          <p className="mb-4 text-sm text-muted-foreground">
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
      <GeneralSearchResultsToolbar
        activeFilterSummaries={activeFilterSummaries}
        advancedMode={advancedMode}
        canExport={canExport}
        exportingPdf={exportingPdf}
        filtersCount={filtersCount}
        isMobile={isMobile}
        logic={logic}
        onExportCsv={onExportCsv}
        onExportPdf={onExportPdf}
        onRowsPerPageChange={onRowsPerPageChange}
        pageSizeOptions={pageSizeOptions}
        query={query}
        resultsLength={results.length}
        resultsPerPage={resultsPerPage}
        totalResults={totalResults}
      />

      {isMobile ? (
        <GeneralSearchMobileResultsList
          headers={headers}
          onRecordSelect={onRecordSelect}
          rangeStart={rangeStart}
          renderCellValue={renderCellValue}
          results={results}
        />
      ) : (
        <Suspense
          fallback={
            <GeneralSearchResultsSkeleton />
          }
        >
          <GeneralSearchDesktopResultsTable
            bottomSpacerHeight={bottomSpacerHeight}
            enableVirtualRows={enableVirtualRows}
            headers={headers}
            onRecordSelect={onRecordSelect}
            onScroll={enableVirtualRows ? handleDesktopTableScroll : undefined}
            renderCellValue={renderCellValue}
            topSpacerHeight={topSpacerHeight}
            virtualRows={virtualRows}
            virtualStartRow={virtualStartRow}
          />
        </Suspense>
      )}

      <GeneralSearchResultsPagination
        currentPage={currentPage}
        isMobile={isMobile}
        loading={loading}
        onPageChange={onPageChange}
        pageItems={pageItems}
        rangeEnd={rangeEnd}
        rangeStart={rangeStart}
        resultsPerPage={resultsPerPage}
        totalPages={totalPages}
        totalResults={totalResults}
      />
    </div>
  );
}
