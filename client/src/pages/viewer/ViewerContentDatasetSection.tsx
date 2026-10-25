import { Suspense, lazy, memo, useCallback, type ReactNode, type RefObject } from "react";
import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import type { DataRowWithId } from "@/pages/viewer/types";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";
import { ViewerSearchBar } from "@/pages/viewer/ViewerSearchBar";
import { ViewerContentEmptyState } from "@/pages/viewer/ViewerContentEmptyState";
import { ViewerContentErrorBanner } from "@/pages/viewer/ViewerContentErrorBanner";
import {
  ViewerDataTableFallback,
  ViewerFooterFallback,
} from "@/pages/viewer/ViewerContentFallbacks";

const ViewerDataTable = lazy(() =>
  import("@/pages/viewer/ViewerDataTable").then((module) => ({
    default: module.ViewerDataTable,
  })),
);
const ViewerFooter = lazy(() =>
  import("@/pages/viewer/ViewerFooter").then((module) => ({
    default: module.ViewerFooter,
  })),
);

type ViewerContentDatasetSectionProps = {
  toolbarActions?: ReactNode;
  filterPanel?: ReactNode;
  allHeaders?: string[] | undefined;
  loading: boolean;
  error: string;
  emptyHint: string;
  isSearchBelowMinLength: boolean;
  onBackToSaved: () => void;
  rows: DataRowWithId[];
  filteredRows: DataRowWithId[];
  visibleHeaders: string[];
  search: string;
  showResultsSummary: boolean;
  activeFilters: ActiveFilterChip[];
  searchInputRef: RefObject<HTMLInputElement>;
  minSearchLength: number;
  debouncedSearch: string;
  enableVirtualRows: boolean;
  gridTemplateColumns: string;
  tableDensity: TableDensity;
  rowHeightPx: number;
  selectedRowIds: Set<number>;
  selectAllFiltered: boolean;
  virtualTableMinWidth: number;
  viewportHeightPx: number;
  totalRows: number;
  currentPage: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  hasPageFilterSubset: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loadingMore: boolean;
  rowsPerPage: number;
  pageSizeDisabled: boolean;
  onRowsPerPageChange: (size: number) => void;
  onClearAllFilters: () => void;
  onSearchChange: (value: string) => void;
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

function ViewerContentDatasetSectionImpl({
  toolbarActions,
  filterPanel,
  allHeaders,
  loading,
  error,
  emptyHint,
  isSearchBelowMinLength,
  onBackToSaved,
  rows,
  filteredRows,
  visibleHeaders,
  search,
  showResultsSummary,
  activeFilters,
  searchInputRef,
  minSearchLength,
  debouncedSearch,
  enableVirtualRows,
  gridTemplateColumns,
  tableDensity,
  rowHeightPx,
  selectedRowIds,
  selectAllFiltered,
  virtualTableMinWidth,
  viewportHeightPx,
  totalRows,
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  hasPageFilterSubset,
  hasNextPage,
  hasPreviousPage,
  loadingMore,
  rowsPerPage,
  pageSizeDisabled,
  onRowsPerPageChange,
  onClearAllFilters,
  onSearchChange,
  onToggleRowSelection,
  onToggleSelectAllFiltered,
  onClearSelection,
  onPrevPage,
  onNextPage,
}: ViewerContentDatasetSectionProps) {
  const hasActiveRefinement = search.trim().length > 0 || activeFilters.length > 0;
  const hasResults = filteredRows.length > 0;
  const handleClearRefinements = useCallback(() => {
    onClearAllFilters();
    searchInputRef.current?.focus({ preventScroll: true });
  }, [onClearAllFilters, searchInputRef]);

  return (
    <section className="viewer-dataset-section min-w-0 space-y-3" aria-label="Dataset records">
      <ViewerSearchBar
        actions={toolbarActions}
        search={search}
        filteredRowsCount={filteredRows.length}
        rowsCount={rows.length}
        showResultsSummary={showResultsSummary}
        activeFilters={activeFilters}
        searchInputRef={searchInputRef}
        totalRows={totalRows}
        loading={loading || loadingMore}
        hasError={Boolean(error)}
        isSearchBelowMinLength={isSearchBelowMinLength}
        minSearchLength={minSearchLength}
        onClearAllFilters={onClearAllFilters}
        onSearchChange={onSearchChange}
      />
      {filterPanel}

      <div aria-busy={loading || loadingMore} className="viewer-results min-w-0">
        {error ? (
          <ViewerContentErrorBanner error={error} onBackToSaved={onBackToSaved} />
        ) : loading ? (
          <ViewerDataTableFallback />
        ) : !hasResults || isSearchBelowMinLength ? (
          <ViewerContentEmptyState
            emptyHint={emptyHint}
            isSearchBelowMinLength={isSearchBelowMinLength}
            minSearchLength={minSearchLength}
            hasActiveRefinement={hasActiveRefinement}
            onClearRefinements={handleClearRefinements}
          />
        ) : (
          <Suspense fallback={<ViewerDataTableFallback />}>
            <ViewerDataTable
              allHeaders={allHeaders}
              debouncedSearch={debouncedSearch}
              enableVirtualRows={enableVirtualRows}
              filteredRows={filteredRows}
              gridTemplateColumns={gridTemplateColumns}
              tableDensity={tableDensity}
              minSearchLength={minSearchLength}
              onToggleRowSelection={onToggleRowSelection}
              onToggleSelectAllFiltered={onToggleSelectAllFiltered}
              rowHeightPx={rowHeightPx}
              selectedRowIds={selectedRowIds}
              selectAllFiltered={selectAllFiltered}
              virtualTableMinWidth={virtualTableMinWidth}
              viewportHeightPx={viewportHeightPx}
              visibleHeaders={visibleHeaders}
            />
          </Suspense>
        )}
      </div>

      {!loading && !error && hasResults && !isSearchBelowMinLength ? (
        <Suspense fallback={<ViewerFooterFallback />}>
          <ViewerFooter
            filteredRowsCount={filteredRows.length}
            rowsCount={rows.length}
            totalRows={totalRows}
            currentPage={currentPage}
            totalPages={totalPages}
            pageStart={pageStart}
            pageEnd={pageEnd}
            selectedRowCount={selectedRowIds.size}
            hasPageFilterSubset={hasPageFilterSubset}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            loadingMore={loadingMore}
            rowsPerPage={rowsPerPage}
            pageSizeDisabled={pageSizeDisabled}
            onRowsPerPageChange={onRowsPerPageChange}
            onClearSelection={onClearSelection}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
          />
        </Suspense>
      ) : null}
    </section>
  );
}

export const ViewerContentDatasetSection = memo(ViewerContentDatasetSectionImpl);
