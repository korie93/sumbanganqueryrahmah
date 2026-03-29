import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const STANDARD_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;

type AppPaginationBarProps = {
  disabled?: boolean;
  page: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  totalItems: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function AppPaginationBar({
  disabled = false,
  page,
  totalPages,
  pageSize,
  pageSizeOptions = STANDARD_PAGE_SIZE_OPTIONS,
  totalItems,
  itemLabel = "records",
  onPageChange,
  onPageSizeChange,
}: AppPaginationBarProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = totalItems === 0 ? 0 : Math.min(totalItems, safePage * pageSize);

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 px-3.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      data-floating-ai-avoid="true"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Showing {start}-{end} of {totalItems} {itemLabel}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
          disabled={disabled}
        >
          <SelectTrigger className="h-9 w-full sm:w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button
            size="sm"
            variant="outline"
            className="w-full min-w-0 sm:w-auto"
            disabled={disabled || safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Prev
          </Button>
          <span className="min-w-[72px] text-center text-xs font-medium text-muted-foreground">
            Page {safePage} / {safeTotalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="w-full min-w-0 sm:w-auto"
            disabled={disabled || safePage >= safeTotalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
