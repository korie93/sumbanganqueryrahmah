import { Suspense, lazy, useEffect, useRef } from "react";
import { OperationalPage } from "@/components/layout/OperationalPage";
import { ViewerContentFallback, ViewerPageHeaderFallback } from "@/pages/viewer/ViewerPageFallbacks";
import { useViewerPageState } from "@/pages/viewer/useViewerPageState";
import "@/pages/viewer/ViewerPage.css";

const VIEWER_SCROLL_PADDING_CLASS = "viewer-page-scroll-padding";

const ViewerPageHeader = lazy(() =>
  import("@/pages/viewer/ViewerPageHeader").then((module) => ({
    default: module.ViewerPageHeader,
  })),
);

const ViewerContent = lazy(() =>
  import("@/pages/viewer/ViewerContent").then((module) => ({
    default: module.ViewerContent,
  })),
);

const ViewerPageHeaderActions = lazy(() =>
  import("@/pages/viewer/ViewerPageHeaderActions").then((module) => ({
    default: module.ViewerPageHeaderActions,
  })),
);

interface ViewerProps {
  onNavigate: (page: string) => void;
  importId?: string | undefined;
  userRole: string;
  viewerRowsPerPage?: number | undefined;
}

export default function Viewer({
  onNavigate,
  importId,
  userRole,
  viewerRowsPerPage,
}: ViewerProps) {
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const viewer = useViewerPageState({
    onNavigate,
    importId,
    userRole,
    viewerRowsPerPage,
  });

  useEffect(() => {
    const { body, documentElement } = document;
    documentElement.classList.add(VIEWER_SCROLL_PADDING_CLASS);
    body.classList.add(VIEWER_SCROLL_PADDING_CLASS);

    return () => {
      documentElement.classList.remove(VIEWER_SCROLL_PADDING_CLASS);
      body.classList.remove(VIEWER_SCROLL_PADDING_CLASS);
    };
  }, []);

  return (
    <OperationalPage width="wide" className="viewer-page-frame">
      <Suspense fallback={<ViewerPageHeaderFallback />}>
        <ViewerPageHeader
          importName={viewer.importName}
          totalRows={viewer.totalRows}
          headersCount={viewer.headers.length}
          loading={viewer.loading}
          onBack={viewer.handleBackToSaved}
        />
      </Suspense>

      <Suspense fallback={<ViewerContentFallback />}>
        <ViewerContent
          toolbarActions={
            <Suspense fallback={<div className="viewer-actions-fallback" aria-hidden="true" />}>
              <ViewerPageHeaderActions
                filterTriggerRef={filterTriggerRef}
                exportBusy={viewer.exportingPdf || viewer.exportingExcel}
                filteredRowsCount={viewer.filteredRows.length}
                filterCount={viewer.columnFilters.length}
                hasFilteredSubset={viewer.hasFilteredSubset}
                headers={viewer.headers}
                densityPreference={viewer.tableDensityPreference}
                isSuperuser={viewer.isSuperuser}
                onClearAllData={viewer.clearAllData}
                onDeselectAllColumns={viewer.deselectAllColumns}
                onDensityChange={viewer.setTableDensityPreference}
                onExportCsv={viewer.handleExportCsv}
                onExportExcel={viewer.handleExportExcel}
                onExportPdf={viewer.handleExportPdf}
                onSelectAllColumns={viewer.selectAllColumns}
                onShowColumnSelectorChange={viewer.setShowColumnSelector}
                onToggleColumn={viewer.toggleColumn}
                onMoveColumn={viewer.moveColumn}
                onResetColumns={viewer.resetColumns}
                onToggleFilters={viewer.handleToggleFilters}
                rowsCount={viewer.rows.length}
                selectedColumns={viewer.selectedColumns}
                selectedRowCount={viewer.selectedRowIds.size}
                showColumnSelector={viewer.showColumnSelector}
                showFilters={viewer.showFilters}
                totalRows={viewer.totalRows}
              />
            </Suspense>
          }
          filterTriggerRef={filterTriggerRef}
          rows={viewer.rows}
          headers={viewer.headers}
          visibleHeaders={viewer.visibleHeaders}
          selectedRowIds={viewer.selectedRowIds}
          totalRows={viewer.totalRows}
          currentPage={viewer.currentPage}
          totalPages={viewer.totalPages}
          pageStart={viewer.pageStart}
          pageEnd={viewer.pageEnd}
          showFilters={viewer.showFilters}
          columnFilters={viewer.columnFilters}
          error={viewer.error}
          loading={viewer.loading}
          emptyHint={viewer.emptyHint}
          isSearchBelowMinLength={viewer.isSearchBelowMinLength}
          minSearchLength={viewer.MIN_SEARCH_LENGTH}
          search={viewer.search}
          filteredRows={viewer.filteredRows}
          showResultsSummary={viewer.columnFilters.length > 0 || viewer.isServerSearchActive}
          activeFilters={viewer.activeFilterChips}
          searchInputRef={viewer.searchInputRef}
          debouncedSearch={viewer.debouncedSearch}
          enableVirtualRows={viewer.enableVirtualRows}
          gridTemplateColumns={viewer.gridTemplateColumns}
          tableDensity={viewer.tableDensity}
          rowHeightPx={viewer.rowHeightPx}
          selectAllFiltered={viewer.selectAllFiltered}
          virtualTableMinWidth={viewer.virtualTableMinWidth}
          viewportHeightPx={viewer.viewportHeightPx}
          hasPageFilterSubset={viewer.hasPageFilterSubset}
          hasNextPage={viewer.hasNextPage}
          hasPreviousPage={viewer.hasPreviousPage}
          loadingMore={viewer.loadingMore}
          rowsPerPage={viewer.rowsPerPage}
          pageSizeDisabled={viewer.pageSizeDisabled}
          onRowsPerPageChange={viewer.handleRowsPerPageChange}
          onBackToSaved={viewer.handleBackToSaved}
          onAddFilter={viewer.addFilter}
          onClearAllFilters={viewer.clearAllFilters}
          onUpdateFilter={viewer.updateFilter}
          onRemoveFilter={viewer.removeFilter}
          onSearchChange={viewer.handleSearchChange}
          onToggleRowSelection={viewer.toggleRowSelection}
          onToggleSelectAllFiltered={viewer.toggleSelectAllFiltered}
          onClearSelection={viewer.clearSelectionState}
          onPrevPage={viewer.handlePrevPage}
          onNextPage={viewer.handleNextPage}
          onShowFiltersChange={viewer.handleShowFiltersChange}
        />
      </Suspense>
    </OperationalPage>
  );
}
