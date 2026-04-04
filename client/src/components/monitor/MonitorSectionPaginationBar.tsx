import { memo } from "react";
import { Button } from "@/components/ui/button";

type MonitorSectionPaginationBarProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  label: string;
  onPageChange: (page: number) => void;
};

function MonitorSectionPaginationBarImpl({
  page,
  totalPages,
  totalItems,
  label,
  onPageChange,
}: MonitorSectionPaginationBarProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/45 px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Page {page} of {totalPages} - {totalItems} {label}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-3"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-3"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export const MonitorSectionPaginationBar = memo(MonitorSectionPaginationBarImpl);
