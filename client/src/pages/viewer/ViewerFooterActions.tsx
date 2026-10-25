import { memo } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildViewerFooterPageLabel } from "@/pages/viewer/footer-utils";
import { getViewerPageSizeOptions } from "@/pages/viewer/viewer-page-size";

interface ViewerFooterActionsProps {
  currentPage: number;
  totalPages: number;
  selectedRowCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loadingMore: boolean;
  rowsPerPage: number;
  pageSizeDisabled: boolean;
  onRowsPerPageChange: (size: number) => void;
  onClearSelection: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

function ViewerFooterActionsImpl({
  currentPage,
  totalPages,
  selectedRowCount,
  hasNextPage,
  hasPreviousPage,
  loadingMore,
  rowsPerPage,
  pageSizeDisabled,
  onRowsPerPageChange,
  onClearSelection,
  onPrevPage,
  onNextPage,
}: ViewerFooterActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <label htmlFor="viewer-page-size" className="text-xs text-muted-foreground">Rows per page</label>
        <select id="viewer-page-size" name="viewerPageSize" data-testid="select-viewer-page-size"
          value={rowsPerPage} disabled={pageSizeDisabled}
          onChange={(event) => onRowsPerPageChange(Number(event.currentTarget.value))}
          className="h-11 w-20 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:h-9">
          {getViewerPageSizeOptions(rowsPerPage).map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </div>
      {selectedRowCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          data-testid="button-clear-selection"
          className="w-full sm:w-auto"
        >
          <X className="mr-1 h-4 w-4" />
          Clear Selection
        </Button>
      ) : null}
      <span className="mr-auto text-xs tabular-nums text-muted-foreground sm:mr-0">
        {buildViewerFooterPageLabel(currentPage, totalPages)}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevPage}
        disabled={loadingMore || !hasPreviousPage}
        data-testid="button-viewer-prev-page"
        className="min-w-20"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        Prev
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onNextPage}
        disabled={loadingMore || !hasNextPage}
        data-testid="button-viewer-next-page"
        className="min-w-20"
      >
        {loadingMore ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}

export const ViewerFooterActions = memo(ViewerFooterActionsImpl);
