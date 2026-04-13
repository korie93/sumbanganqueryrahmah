import { Suspense, lazy, useEffect } from "react";
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
    <OperationalPage width="content">
      <Suspense fallback={<ViewerPageHeaderFallback />}>
        <ViewerPageHeader
          importName={viewer.importName}
          rowsCount={viewer.rows.length}
          totalRows={viewer.totalRows}
          currentPage={viewer.currentPage}
          totalPages={viewer.totalPages}
          headers={viewer.headers}
          selectedColumns={viewer.selectedColumns}
          showColumnSelector={viewer.showColumnSelector}
          showFilters={viewer.showFilters}
          filterCount={viewer.columnFilters.length}
          isSuperuser={viewer.isSuperuser}
          exportBusy={viewer.exportingPdf || viewer.exportingExcel}
          filteredRowsCount={viewer.filteredRows.length}
          selectedRowCount={viewer.selectedRowIds.size}
          hasFilteredSubset={viewer.hasFilteredSubset}
          onBack={viewer.handleBackToSaved}
          onShowColumnSelectorChange={viewer.setShowColumnSelector}
          onToggleColumn={viewer.toggleColumn}
          onSelectAllColumns={viewer.selectAllColumns}
          onDeselectAllColumns={viewer.deselectAllColumns}
          onToggleFilters={viewer.handleToggleFilters}
          onClearAllData={viewer.clearAllData}
          onExportCsv={viewer.handleExportCsv}
          onExportPdf={viewer.handleExportPdf}
          onExportExcel={viewer.handleExportExcel}
        />
      </Suspense>

      <Suspense fallback={<ViewerContentFallback />}>
        <ViewerContent
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
          rowHeightPx={viewer.rowHeightPx}
          selectAllFiltered={viewer.selectAllFiltered}
          virtualTableMinWidth={viewer.virtualTableMinWidth}
          viewportHeightPx={viewer.viewportHeightPx}
          hasPageFilterSubset={viewer.hasPageFilterSubset}
          hasNextPage={viewer.hasNextPage}
          hasPreviousPage={viewer.hasPreviousPage}
          loadingMore={viewer.loadingMore}
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
