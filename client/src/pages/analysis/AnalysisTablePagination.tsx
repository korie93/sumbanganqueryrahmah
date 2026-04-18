import { Button } from "@/components/ui/button";
import { TABLE_PAGE_SIZE } from "@/pages/analysis/utils";

type AnalysisTablePaginationProps = {
  currentPage: number;
  end: number;
  label: string;
  start: number;
  totalItems: number;
  totalPages: number;
  onNext: () => void;
  onPrevious: () => void;
};

export function AnalysisTablePagination({
  currentPage,
  end,
  label,
  start,
  totalItems,
  totalPages,
  onNext,
  onPrevious,
}: AnalysisTablePaginationProps) {
  if (totalItems <= TABLE_PAGE_SIZE) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-muted-foreground">
        Showing {start + 1}-{end} of {totalItems.toLocaleString()} {label}
      </span>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={currentPage <= 0}
          className="min-w-20"
        >
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {currentPage + 1} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={currentPage >= totalPages - 1}
          className="min-w-20"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
