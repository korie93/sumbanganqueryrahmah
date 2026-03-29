import { Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { GeneralSearchControls } from "@/pages/general-search/GeneralSearchControls";
import { GeneralSearchRecordDialog } from "@/pages/general-search/GeneralSearchRecordDialog";
import { GeneralSearchResults } from "@/pages/general-search/GeneralSearchResults";
import { useGeneralSearchController } from "@/pages/general-search/useGeneralSearchController";

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

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 px-3 py-4 sm:p-6 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-6xl">
        <div
          className={`mb-6 rounded-2xl border border-border/60 bg-background/70 px-4 py-4 shadow-sm sm:mb-8 sm:px-6 sm:py-6 ${
            isMobile ? "text-left" : "text-center"
          }`}
          data-floating-ai-avoid="true"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            General Search
          </p>
          <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">Data Search</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:mx-auto sm:text-base">
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

        {state.searched && !state.loading ? (
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

      <GeneralSearchRecordDialog
        canSeeSourceFile={canSeeSourceFile}
        onOpenChange={(open) => {
          if (!open) actions.setSelectedRecord(null);
        }}
        record={state.selectedRecord}
      />
    </div>
  );
}
