import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ViewerFooterProps {
  filteredRowsCount: number;
  rowsCount: number;
  totalRows: number;
  currentPage: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  selectedRowCount: number;
  hasPageFilterSubset: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loadingMore: boolean;
  onClearSelection: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function ViewerFooter({
  filteredRowsCount,
  rowsCount,
  totalRows,
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  selectedRowCount,
  hasPageFilterSubset,
  hasNextPage,
  hasPreviousPage,
  loadingMore,
  onClearSelection,
  onPrevPage,
  onNextPage,
}: ViewerFooterProps) {
  if (rowsCount === 0 && totalRows === 0) {
    return null;
  }

  return (
    <div
      className="mt-4 flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 px-3.5 py-2.5 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      data-floating-ai-avoid="true"
    >
      <span>
        Showing {pageStart}-{pageEnd} of {totalRows} rows
        {hasPageFilterSubset ? ` (${filteredRowsCount} match current page filters)` : ""}
        {selectedRowCount > 0 ? ` (${selectedRowCount} selected)` : ""}
      </span>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {selectedRowCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            data-testid="button-clear-selection"
            className="w-full sm:w-auto"
          >
            <X className="w-4 h-4 mr-1" />
            Clear Selection
          </Button>
        ) : null}
        <span className="text-center text-xs text-muted-foreground sm:text-left">Page {currentPage} of {totalPages}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevPage}
          disabled={loadingMore || !hasPreviousPage}
          data-testid="button-viewer-prev-page"
          className="w-full sm:w-auto"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNextPage}
          disabled={loadingMore || !hasNextPage}
          data-testid="button-viewer-next-page"
          className="w-full sm:w-auto"
        >
          {loadingMore ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
