import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildViewerFooterPageLabel } from "@/pages/viewer/footer-utils";

interface ViewerFooterActionsProps {
  currentPage: number;
  totalPages: number;
  selectedRowCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loadingMore: boolean;
  onClearSelection: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function ViewerFooterActions({
  currentPage,
  totalPages,
  selectedRowCount,
  hasNextPage,
  hasPreviousPage,
  loadingMore,
  onClearSelection,
  onPrevPage,
  onNextPage,
}: ViewerFooterActionsProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
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
      <span className="text-center text-xs text-muted-foreground sm:text-left">
        {buildViewerFooterPageLabel(currentPage, totalPages)}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevPage}
        disabled={loadingMore || !hasPreviousPage}
        data-testid="button-viewer-prev-page"
        className="w-full sm:w-auto"
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
        className="w-full sm:w-auto"
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
