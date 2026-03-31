import { buildViewerFooterSummary } from "@/pages/viewer/footer-utils";
import { ViewerFooterActions } from "@/pages/viewer/ViewerFooterActions";

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
      className="sticky bottom-0 z-20 mt-4 flex flex-col gap-3 rounded-xl border border-border/60 bg-background/95 px-3.5 py-2.5 text-sm text-muted-foreground shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 md:static md:z-auto md:bg-background/70 md:shadow-none md:backdrop-blur-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
      data-floating-ai-avoid="true"
    >
      <span>
        {buildViewerFooterSummary(
          pageStart,
          pageEnd,
          totalRows,
          filteredRowsCount,
          hasPageFilterSubset,
          selectedRowCount,
        )}
      </span>
      <ViewerFooterActions
        currentPage={currentPage}
        totalPages={totalPages}
        selectedRowCount={selectedRowCount}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        loadingMore={loadingMore}
        onClearSelection={onClearSelection}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
      />
    </div>
  );
}
