import { Suspense, lazy, type RefObject } from "react";
import { AlertCircle } from "lucide-react";
import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ViewerDataTable } from "@/pages/viewer/ViewerDataTable";
import { ViewerEmptyState } from "@/pages/viewer/ViewerEmptyState";
import { ViewerFooter } from "@/pages/viewer/ViewerFooter";
import { ViewerLoadingSkeleton } from "@/pages/viewer/ViewerLoadingSkeleton";
import { ViewerSearchBar } from "@/pages/viewer/ViewerSearchBar";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";

const ViewerFiltersPanel = lazy(() =>
  import("@/pages/viewer/ViewerFiltersPanel").then((module) => ({
    default: module.ViewerFiltersPanel,
  })),
);

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
  onUpdateFilter: (index: number, field: keyof ColumnFilter, value: string) => void;
  onRemoveFilter: (index: number) => void;
  onSearchChange: (value: string) => void;
  onToggleRowSelection: (rowId: number) => void;
  onToggleSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onShowFiltersChange: (open: boolean) => void;
};

function ViewerFiltersPanelFallback() {
  return (
    <div className="ops-toolbar mb-6 space-y-3">
      <div className="h-5 w-40 animate-pulse rounded bg-muted/40" />
      <div className="h-10 w-full animate-pulse rounded-xl border border-border/60 bg-muted/25" />
      <div className="h-10 w-full animate-pulse rounded-xl border border-border/60 bg-muted/25" />
    </div>
  );
}

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

  const filtersPanel = (
    <Suspense fallback={<ViewerFiltersPanelFallback />}>
      <ViewerFiltersPanel
        headers={headers}
        columnFilters={columnFilters}
        onAddFilter={onAddFilter}
        onClearAllFilters={onClearAllFilters}
        onUpdateFilter={onUpdateFilter}
        onRemoveFilter={onRemoveFilter}
      />
    </Suspense>
  );

  return (
    <>
      {rows.length > 0 ? (
        <OperationalSummaryStrip>
          <OperationalMetric
            label="Page rows"
            value={rows.length}
            supporting={totalRows > 0 ? `Rows ${pageStart}-${pageEnd} of ${totalRows}` : "No rows loaded"}
          />
          <OperationalMetric
            label="Visible columns"
            value={`${visibleHeaders.length}/${headers.length || visibleHeaders.length}`}
            supporting="Current table layout"
          />
          <OperationalMetric
            label="Selected rows"
            value={selectedRowIds.size}
            supporting={selectedRowIds.size > 0 ? "Ready for focused export" : "No rows selected"}
          />
        </OperationalSummaryStrip>
      ) : null}

      {rows.length > 0 && showFilters && !isMobile ? filtersPanel : null}

      {error ? (
        <OperationalSectionCard className="border-destructive/35 bg-destructive/5" contentClassName="space-y-0">
          <div className="flex flex-wrap items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">{error}</span>
            <Button variant="ghost" onClick={onBackToSaved} className="ml-auto text-destructive">
              Back to Saved Imports
            </Button>
          </div>
        </OperationalSectionCard>
      ) : null}

      {loading ? (
        <ViewerLoadingSkeleton />
      ) : rows.length === 0 && !error ? (
        <ViewerEmptyState
          emptyHint={emptyHint}
          isSearchBelowMinLength={isSearchBelowMinLength}
          minSearchLength={minSearchLength}
        />
      ) : (
        <OperationalSectionCard
          title="Dataset rows"
          description="Search the dataset, review one page at a time, and export only what you need."
          contentClassName="space-y-4"
        >
          {rows.length > 0 ? (
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
          ) : null}

          {rows.length > 0 && isMobile ? (
            <Sheet open={showFilters} onOpenChange={onShowFiltersChange}>
              <SheetContent
                side="bottom"
                className="max-h-[88dvh] rounded-t-[1.75rem] border-border/70 bg-background/98 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4"
                data-floating-ai-avoid="true"
              >
                <SheetHeader className="pr-8 text-left">
                  <SheetTitle>Column Filters</SheetTitle>
                  <SheetDescription>
                    Narrow matching rows across the dataset without leaving the viewer.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4">{filtersPanel}</div>
              </SheetContent>
            </Sheet>
          ) : null}

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
        </OperationalSectionCard>
      )}
    </>
  );
}
