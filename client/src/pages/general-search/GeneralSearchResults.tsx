import { Suspense, lazy, useMemo } from "react";
import { FileText } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { GeneralSearchMobileResultsList } from "@/pages/general-search/GeneralSearchMobileResultsList";
import { GeneralSearchResultsPagination } from "@/pages/general-search/GeneralSearchResultsPagination";
import { GeneralSearchResultsToolbar } from "@/pages/general-search/GeneralSearchResultsToolbar";
import type { SearchResultRow } from "@/pages/general-search/types";
import {
  buildGeneralSearchPaginationItems,
  buildGeneralSearchResultsRange,
} from "@/pages/general-search/general-search-results-utils";
import { highlightMatch } from "@/pages/general-search/utils";

const GeneralSearchDesktopResultsTable = lazy(() =>
  import("@/pages/general-search/GeneralSearchDesktopResultsTable").then((module) => ({
    default: module.GeneralSearchDesktopResultsTable,
  })),
);

interface GeneralSearchResultsProps {
  activeFilterSummaries: string[];
  advancedMode: boolean;
  canExport: boolean;
  canSeeSourceFile: boolean;
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
  totalResultsIsApproximate: boolean;
}

export function GeneralSearchResults({
  activeFilterSummaries,
  advancedMode,
  canExport,
  canSeeSourceFile,
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
  totalResultsIsApproximate,
}: GeneralSearchResultsProps) {
  const isMobile = useIsMobile();
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

  const renderCellValue = (safeText: string) =>
    advancedMode || isLowSpecMode ? safeText : highlightMatch(safeText, query);

  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium text-foreground">No results found</p>
            <p className="text-sm leading-6 text-muted-foreground">
              {advancedMode
                ? "Try changing your filters, use different operators, or check if data has been imported."
                : "Try different keywords or check your spelling. Make sure data has been imported first."}
            </p>
            <div className="space-y-2 pt-2 text-xs leading-5 text-muted-foreground">
              <p><strong>Troubleshooting:</strong></p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Verify data has been imported in the "Import Data" tab</li>
                <li>Check that your search query is at least 2 characters</li>
                <li>Try searching for different values</li>
                <li>In advanced mode, ensure filters are correctly configured</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4" data-testid="general-search-results" data-floating-ai-avoid="true">
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
        totalResultsIsApproximate={totalResultsIsApproximate}
      />

      {isMobile ? (
        <GeneralSearchMobileResultsList
          canSeeSourceFile={canSeeSourceFile}
          headers={headers}
          onRecordSelect={onRecordSelect}
          rangeStart={rangeStart}
          renderCellValue={renderCellValue}
          results={results}
        />
      ) : (
        <Suspense
          fallback={
            <div className="rounded-lg border border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              Loading result table...
            </div>
          }
        >
          <GeneralSearchDesktopResultsTable
            currentPage={currentPage}
            resultsPerPage={resultsPerPage}
            isLowSpecMode={isLowSpecMode}
            canSeeSourceFile={canSeeSourceFile}
            headers={headers}
            onRecordSelect={onRecordSelect}
            renderCellValue={renderCellValue}
            results={results}
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
