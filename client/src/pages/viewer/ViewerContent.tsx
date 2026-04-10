import type { RefObject } from "react";
import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { useIsMobile } from "@/hooks/use-mobile";
import { ViewerLoadingSkeleton } from "@/pages/viewer/ViewerLoadingSkeleton";
import type { ColumnFilter, DataRowWithId, ViewerFilterMutableField } from "@/pages/viewer/types";
import { ViewerContentDatasetSection } from "@/pages/viewer/ViewerContentDatasetSection";
import { ViewerContentEmptyState } from "@/pages/viewer/ViewerContentEmptyState";
import { ViewerContentErrorBanner } from "@/pages/viewer/ViewerContentErrorBanner";
import { ViewerContentFiltersSection } from "@/pages/viewer/ViewerContentFiltersSection";
import { ViewerContentSummaryStrip } from "@/pages/viewer/ViewerContentSummaryStrip";

type ViewerContentProps = {
  rows: DataRowWithId[];
  headers: string[];
  visibleHeaders: string[];
  selectedRowIds: Set<number>;
  totalRows: number;
  currentPage: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  showFilters: boolean;
  columnFilters: ColumnFilter[];
  error: string;
  loading: boolean;
  emptyHint: string;
  isSearchBelowMinLength: boolean;
  minSearchLength: number;
  search: string;
  filteredRows: DataRowWithId[];
  showResultsSummary: boolean;
  activeFilters: ActiveFilterChip[];
  searchInputRef: RefObject<HTMLInputElement>;
  debouncedSearch: string;
  enableVirtualRows: boolean;
  gridTemplateColumns: string;
  rowHeightPx: number;
  selectAllFiltered: boolean;
  virtualTableMinWidth: number;
  viewportHeightPx: number;
  hasPageFilterSubset: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loadingMore: boolean;
  onBackToSaved: () => void;
  onAddFilter: () => void;
  onClearAllFilters: () => void;
  onUpdateFilter: (index: number, field: ViewerFilterMutableField, value: string) => void;
  onRemoveFilter: (index: number) => void;
  onSearchChange: (value: string) => void;
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onShowFiltersChange: (open: boolean) => void;
};

export function ViewerContent({
  rows,
  headers,
  visibleHeaders,
  selectedRowIds,
  totalRows,
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  showFilters,
  columnFilters,
  error,
  loading,
  emptyHint,
  isSearchBelowMinLength,
  minSearchLength,
  search,
  filteredRows,
  showResultsSummary,
  activeFilters,
  searchInputRef,
  debouncedSearch,
  enableVirtualRows,
  gridTemplateColumns,
  rowHeightPx,
  selectAllFiltered,
  virtualTableMinWidth,
  viewportHeightPx,
  hasPageFilterSubset,
  hasNextPage,
  hasPreviousPage,
  loadingMore,
  onBackToSaved,
  onAddFilter,
  onClearAllFilters,
  onUpdateFilter,
  onRemoveFilter,
  onSearchChange,
  onToggleRowSelection,
  onToggleSelectAllFiltered,
  onClearSelection,
  onPrevPage,
  onNextPage,
  onShowFiltersChange,
}: ViewerContentProps) {
  const isMobile = useIsMobile();
  const hasRows = rows.length > 0;

  return (
    <>
      {hasRows ? (
        <ViewerContentSummaryStrip
          rowsCount={rows.length}
          totalRows={totalRows}
          pageStart={pageStart}
          pageEnd={pageEnd}
          visibleHeadersCount={visibleHeaders.length}
          headersCount={headers.length}
          selectedRowCount={selectedRowIds.size}
        />
      ) : null}

      <ViewerContentFiltersSection
        hasRows={hasRows}
        isMobile={isMobile}
        showFilters={showFilters}
        headers={headers}
        columnFilters={columnFilters}
        onAddFilter={onAddFilter}
        onClearAllFilters={onClearAllFilters}
        onUpdateFilter={onUpdateFilter}
        onRemoveFilter={onRemoveFilter}
        onShowFiltersChange={onShowFiltersChange}
      />

      {error ? <ViewerContentErrorBanner error={error} onBackToSaved={onBackToSaved} /> : null}

      {loading ? (
        <ViewerLoadingSkeleton />
      ) : !hasRows && !error ? (
        <ViewerContentEmptyState
          emptyHint={emptyHint}
          isSearchBelowMinLength={isSearchBelowMinLength}
          minSearchLength={minSearchLength}
        />
      ) : (
        <ViewerContentDatasetSection
          rows={rows}
          filteredRows={filteredRows}
          visibleHeaders={visibleHeaders}
          search={search}
          showResultsSummary={showResultsSummary}
          activeFilters={activeFilters}
          searchInputRef={searchInputRef}
          minSearchLength={minSearchLength}
          debouncedSearch={debouncedSearch}
          enableVirtualRows={enableVirtualRows}
          gridTemplateColumns={gridTemplateColumns}
          rowHeightPx={rowHeightPx}
          selectedRowIds={selectedRowIds}
          selectAllFiltered={selectAllFiltered}
          virtualTableMinWidth={virtualTableMinWidth}
          viewportHeightPx={viewportHeightPx}
          totalRows={totalRows}
          currentPage={currentPage}
          totalPages={totalPages}
          pageStart={pageStart}
          pageEnd={pageEnd}
          hasPageFilterSubset={hasPageFilterSubset}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          loadingMore={loadingMore}
          onClearAllFilters={onClearAllFilters}
          onSearchChange={onSearchChange}
          onToggleRowSelection={onToggleRowSelection}
          onToggleSelectAllFiltered={onToggleSelectAllFiltered}
          onClearSelection={onClearSelection}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
        />
      )}
    </>
  );
}
