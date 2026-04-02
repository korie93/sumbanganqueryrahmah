import { Suspense, lazy } from "react";
import { Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { GeneralSearchControls } from "@/pages/general-search/GeneralSearchControls";
import { useGeneralSearchController } from "@/pages/general-search/useGeneralSearchController";

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
  const isMobile = useIsMobile();
  const controller = useGeneralSearchController({ userRole, searchResultLimit });
  const { actions, canExport, canSeeSourceFile, isLowSpecMode, state } = controller;
  const shouldShowResults = state.searched && !state.loading;
  const shouldShowRecordDialog = state.selectedRecord !== null;

  return (
    <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 px-3 py-4 sm:p-6 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-6xl">
        <div
          className={`relative mb-6 rounded-2xl border border-border/60 bg-background/70 px-4 py-4 shadow-sm sm:mb-8 sm:px-6 sm:py-6 ${
            isMobile ? "overflow-hidden text-left" : "text-center"
          }`}
          data-floating-ai-avoid="true"
        >
          {isMobile ? (
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent" />
          ) : null}
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            General Search
          </p>
          <h1 className="relative mt-2 text-2xl font-bold text-foreground sm:text-3xl">Data Search</h1>
          <p className="relative mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:mx-auto sm:text-base">
            Search imported data quickly by keyword or switch to advanced filters for more precise matching.
          </p>
        </div>

        <GeneralSearchControls
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
              <div className="glass-wrapper p-6" role="status" aria-live="polite">
                <div className="flex min-h-[240px] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                </div>
              </div>
            }
          >
            <GeneralSearchResults
              advancedMode={state.advancedMode}
              canExport={canExport}
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
              onRecordSelect={actions.setSelectedRecord}
              onRowsPerPageChange={actions.handleResultsPerPageChange}
              pageSizeOptions={state.pageSizeOptions}
              query={state.displayQuery}
              results={state.results}
              resultsPerPage={state.resultsPerPage}
              totalResults={state.totalResults}
            />
          </Suspense>
        ) : null}

        {!state.searched ? (
          <div className="glass-wrapper p-6 text-center sm:p-12" data-floating-ai-avoid="true">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Search className="h-8 w-8 text-primary" />
            </div>
            <p className="mb-2 font-medium text-foreground">Start Search</p>
            <p className="mb-4 text-sm text-muted-foreground">
              {state.advancedMode
                ? "Add filters to search data with specific criteria."
                : "Enter IC number, name, or keywords to search in all data."}
            </p>
          </div>
        ) : null}
      </div>

      {shouldShowRecordDialog ? (
        <Suspense fallback={null}>
          <GeneralSearchRecordDialog
            canSeeSourceFile={canSeeSourceFile}
            onOpenChange={(open) => {
              if (!open) actions.setSelectedRecord(null);
            }}
            record={state.selectedRecord}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
