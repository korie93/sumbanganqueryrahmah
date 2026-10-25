import { memo } from "react";
import styles from "@/pages/viewer/ViewerFooter.module.css";
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
  rowsPerPage: number;
  pageSizeDisabled: boolean;
  onRowsPerPageChange: (size: number) => void;
  onClearSelection: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

function ViewerFooterImpl({
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
  rowsPerPage,
  pageSizeDisabled,
  onRowsPerPageChange,
  onClearSelection,
  onPrevPage,
  onNextPage,
}: ViewerFooterProps) {
  if (rowsCount === 0 && totalRows === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Dataset pagination"
      className={`${styles.footerSafeArea} mt-4 flex flex-col gap-2 border-t border-border pt-3 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between`}
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
        rowsPerPage={rowsPerPage}
        pageSizeDisabled={pageSizeDisabled}
        onRowsPerPageChange={onRowsPerPageChange}
        onClearSelection={onClearSelection}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
      />
    </nav>
  );
}

export const ViewerFooter = memo(ViewerFooterImpl);
