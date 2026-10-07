import { Suspense, lazy, useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { OperationalPage } from "@/components/layout/OperationalPage";
import { LazyDialogFallback } from "@/components/LazySuspenseFallback";
import { GeneralSearchControls } from "@/pages/general-search/GeneralSearchControls";
import { useGeneralSearchController } from "@/pages/general-search/useGeneralSearchController";
import type { SearchResultRow } from "@/pages/general-search/types";
import "@/pages/general-search/general-search-layout.css";

const GeneralSearchResults = lazy(() =>
  import("@/pages/general-search/GeneralSearchResults").then((module) => ({
    default: module.GeneralSearchResults,
  })),
);
const GeneralSearchRecordDialog = lazy(() =>
  import("@/pages/general-search/GeneralSearchRecordDialog").then((module) => ({
    default: module.GeneralSearchRecordDialog,
  })),
);

interface GeneralSearchProps {
  userRole?: string;
  searchResultLimit?: number;
}

export default function GeneralSearch({
  userRole,
  searchResultLimit,
}: GeneralSearchProps) {
  const controller = useGeneralSearchController({ userRole, searchResultLimit });
  const { actions, canExport, canSeeSourceFile, isLowSpecMode, state } = controller;
  const shouldShowResults = state.searched && !state.loading;
  const shouldShowRecordDialog = state.selectedRecord !== null;
  const recordTriggerRef = useRef<HTMLElement | null>(null);
  const selectResultRecord = useCallback((record: SearchResultRow) => {
    // Capture before the lazy dialog mounts or its loading fallback takes focus.
    recordTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    actions.setSelectedRecord(record);
  }, [actions.setSelectedRecord]);
  const restoreRecordTriggerFocus = useCallback((event: Event) => {
    const trigger = recordTriggerRef.current;
    if (trigger?.isConnected) {
      event.preventDefault();
      trigger.focus({ preventScroll: true });
    }
    recordTriggerRef.current = null;
  }, []);

  return (
    <OperationalPage width="report" className="general-search-page">
        <header className="w-full max-w-6xl space-y-1" data-floating-ai-avoid="true">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-section-title">
            Data Search
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Search imported data by keyword or use advanced filters for precise matching.
          </p>
        </header>

        <GeneralSearchControls
          activeFilterSummaries={state.activeFilterSummaries}
          activeFiltersCount={state.activeFiltersCount}
          advancedMode={state.advancedMode}
          columns={state.columns}
          error={state.error}
          filters={state.filters}
          loading={state.loading}
          loadingColumns={state.loadingColumns}
          logic={state.logic}
          query={state.query}
          onAddFilter={actions.addFilter}
          onLogicChange={actions.setLogic}
          onModeChange={actions.setAdvancedMode}
          onQueryChange={actions.handleQueryChange}
          onRemoveFilter={actions.removeFilter}
          onReset={actions.handleReset}
          onSearch={actions.handleSearch}
          onUpdateFilter={actions.updateFilter}
        />

        {shouldShowResults ? (
          <Suspense
            fallback={
              <div className="rounded-lg border border-border bg-card p-6" role="status" aria-live="polite">
                <div className="flex min-h-[120px] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                </div>
              </div>
            }
          >
            <GeneralSearchResults
              activeFilterSummaries={state.activeFilterSummaries}
              advancedMode={state.advancedMode}
              canExport={canExport}
              canSeeSourceFile={canSeeSourceFile}
              currentPage={state.currentPage}
              exportingPdf={state.exportingPdf}
              filtersCount={state.activeFiltersCount}
              headers={state.headers}
              isLowSpecMode={isLowSpecMode}
              loading={state.loading}
              logic={state.logic}
              onExportCsv={actions.exportToCSV}
              onExportPdf={actions.exportToPDF}
              onPageChange={actions.handlePageChange}
              onRecordSelect={selectResultRecord}
              onRowsPerPageChange={actions.handleResultsPerPageChange}
              pageSizeOptions={state.pageSizeOptions}
              query={state.displayQuery}
              results={state.results}
              resultsPerPage={state.resultsPerPage}
              totalResults={state.totalResults}
              totalResultsIsApproximate={state.totalResultsIsApproximate}
            />
          </Suspense>
        ) : null}

        {!state.searched ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 sm:p-5" data-floating-ai-avoid="true">
            <Search className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Start Search</p>
              <p className="text-sm leading-6 text-muted-foreground">
              {state.advancedMode
                ? "Add filters to search data with specific criteria."
                : "Enter IC number, name, or keywords to search in all data."}
              </p>
            </div>
          </div>
        ) : null}

      {shouldShowRecordDialog ? (
        <Suspense fallback={<LazyDialogFallback label="Loading search result details dialog..." />}>
          <GeneralSearchRecordDialog
            canSeeSourceFile={canSeeSourceFile}
            onCloseAutoFocus={restoreRecordTriggerFocus}
            onOpenChange={(open) => {
              if (!open) actions.setSelectedRecord(null);
            }}
            onRecordSelect={actions.setSelectedRecord}
            record={state.selectedRecord}
            relatedRecords={state.results}
          />
        </Suspense>
      ) : null}
    </OperationalPage>
  );
}
