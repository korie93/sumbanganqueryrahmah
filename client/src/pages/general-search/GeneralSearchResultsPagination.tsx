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

export function GeneralSearchResultsPagination({
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
  let previousRenderedPage: number | null = null;

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
              className="h-11 w-full"
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <div className="px-2 py-2 text-center text-sm font-medium text-foreground">
              Page {currentPage} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="h-11 w-full"
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
              className="h-9"
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {pageItems.map((item) => {
                if (item === "ellipsis") {
                  return (
                  <span key={`ellipsis-after-${previousRenderedPage ?? "start"}`} className="text-muted-foreground">
                    ...
                  </span>
                  );
                }

                previousRenderedPage = item;

                return (
                  <Button
                    key={`page-${item}`}
                    variant={currentPage === item ? "default" : "outline"}
                    size="sm"
                    onClick={() => onPageChange(item)}
                    disabled={loading}
                    className="h-9 w-9"
                    data-testid={`button-page-${item}`}
                  >
                    {item}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="h-9"
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
