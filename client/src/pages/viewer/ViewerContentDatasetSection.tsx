import { Suspense, type RefObject } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import type { DataRowWithId } from "@/pages/viewer/types";
import {
  ViewerDataTableFallback,
  ViewerFooterFallback,
  ViewerSearchBarFallback,
} from "@/pages/viewer/ViewerContentFallbacks";

const ViewerSearchBar = lazyWithPreload(() =>
  import("@/pages/viewer/ViewerSearchBar").then((module) => ({
    default: module.ViewerSearchBar,
  })),
);
const ViewerDataTable = lazyWithPreload(() =>
  import("@/pages/viewer/ViewerDataTable").then((module) => ({
    default: module.ViewerDataTable,
  })),
);
const ViewerFooter = lazyWithPreload(() =>
  import("@/pages/viewer/ViewerFooter").then((module) => ({
    default: module.ViewerFooter,
  })),
);

type ViewerContentDatasetSectionProps = {
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
  onClearAllFilters: () => void;
  onSearchChange: (value: string) => void;
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export function ViewerContentDatasetSection({
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
  onClearAllFilters,
  onSearchChange,
  onToggleRowSelection,
  onToggleSelectAllFiltered,
  onClearSelection,
  onPrevPage,
  onNextPage,
}: ViewerContentDatasetSectionProps) {
  return (
    <OperationalSectionCard
      title="Dataset rows"
      description="Search the dataset, review one page at a time, and export only what you need."
      contentClassName="space-y-4"
    >
      {rows.length > 0 ? (
        <Suspense fallback={<ViewerSearchBarFallback />}>
          <ViewerSearchBar
            search={search}
            filteredRowsCount={filteredRows.length}
            rowsCount={rows.length}
            showResultsSummary={showResultsSummary}
            activeFilters={activeFilters}
            searchInputRef={searchInputRef}
            onClearAllFilters={onClearAllFilters}
            onSearchChange={onSearchChange}
          />
        </Suspense>
      ) : null}

      <Suspense fallback={<ViewerDataTableFallback />}>
        <ViewerDataTable
          debouncedSearch={debouncedSearch}
          enableVirtualRows={enableVirtualRows}
          filteredRows={filteredRows}
          gridTemplateColumns={gridTemplateColumns}
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
          onClearSelection={onClearSelection}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
        />
      </Suspense>
    </OperationalSectionCard>
  );
}
