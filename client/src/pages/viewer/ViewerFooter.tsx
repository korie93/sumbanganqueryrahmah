import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ViewerFooterProps {
  filteredRowsCount: number;
  isFiltering: boolean;
  rowsCount: number;
  totalRows: number;
  selectedRowCount: number;
  isServerSearchActive: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onClearSelection: () => void;
  onLoadMore: () => void;
}

export function ViewerFooter({
  filteredRowsCount,
  isFiltering,
  rowsCount,
  totalRows,
  selectedRowCount,
  isServerSearchActive,
  hasMore,
  loadingMore,
  onClearSelection,
  onLoadMore,
}: ViewerFooterProps) {
  if (filteredRowsCount === 0) {
    return null;
  }

  return (
    <div
      className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/70 px-3.5 py-2.5 text-sm text-muted-foreground"
      data-floating-ai-avoid="true"
    >
      <span>
        Showing {isFiltering ? filteredRowsCount : rowsCount} of {totalRows} rows
        {selectedRowCount > 0 ? ` (${selectedRowCount} selected)` : ""}
      </span>
      <div className="flex items-center gap-2">
        {selectedRowCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            data-testid="button-clear-selection"
          >
            <X className="w-4 h-4 mr-1" />
            Clear Selection
          </Button>
        ) : null}
        {!isServerSearchActive && hasMore ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={loadingMore}
            data-testid="button-load-more"
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>Load More ({totalRows - rowsCount} remaining)</>
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
