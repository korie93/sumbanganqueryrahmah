import { memo } from "react";
import { Button } from "@/components/ui/button";

interface GeneralSearchResultsPaginationProps {
  currentPage: number;
  isMobile: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
  pageItems: Array<number | "ellipsis">;
  rangeEnd: number;
  rangeStart: number;
  resultsPerPage: number;
  totalPages: number;
  totalResults: number;
}

export const GeneralSearchResultsPagination = memo(function GeneralSearchResultsPagination({
  currentPage,
  isMobile,
  loading,
  onPageChange,
  pageItems,
  rangeEnd,
  rangeStart,
  resultsPerPage,
  totalPages,
  totalResults,
}: GeneralSearchResultsPaginationProps) {
  return (
    <div className={`mt-4 gap-3 ${isMobile ? "space-y-3" : "flex flex-wrap items-center justify-between"}`}>
      <p className="text-sm text-muted-foreground">
        Showing {rangeStart} - {rangeEnd} of {totalResults} results
      </p>

      {totalResults > resultsPerPage ? (
        isMobile ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="h-10 w-full"
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-center text-sm font-medium text-foreground">
              Page {currentPage} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="h-10 w-full"
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {pageItems.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={item}
                    variant={currentPage === item ? "default" : "outline"}
                    size="sm"
                    onClick={() => onPageChange(item)}
                    disabled={loading}
                    className="w-8"
                    data-testid={`button-page-${item}`}
                  >
                    {item}
                  </Button>
                ),
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
});
