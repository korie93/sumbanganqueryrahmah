import { Button } from "@/components/ui/button";
import type { CollectionDailyDayDetailsResponse } from "@/lib/api";

type CollectionDailyDayDetailsFooterProps = {
  dayDetails: CollectionDailyDayDetailsResponse;
  isMobile: boolean;
  loadingDayDetails: boolean;
  onChangePage: (page: number) => void;
  recordRangeLabel: string;
  selectedDate: string | null;
};

export function CollectionDailyDayDetailsFooter({
  dayDetails,
  isMobile,
  loadingDayDetails,
  onChangePage,
  recordRangeLabel,
  selectedDate,
}: CollectionDailyDayDetailsFooterProps) {
  return (
    <div
      className={`sticky bottom-0 z-[var(--z-sticky-content)] flex flex-col gap-3 border-t border-border/60 bg-background/95 pb-[calc(var(--safe-area-inset-bottom)+0.75rem)] pt-3 text-sm shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 ${
        isMobile ? "-mx-3 px-3" : "-mx-4 px-4 sm:-mx-6 sm:px-6"
      } sm:flex-row sm:items-center sm:justify-between`}
      aria-label="Navigasi halaman rekod kutipan harian"
      data-floating-ai-avoid="true"
    >
      <div className={`text-muted-foreground ${isMobile ? "text-xs" : ""}`}>
        {recordRangeLabel} - Halaman {dayDetails.pagination.page} daripada {dayDetails.pagination.totalPages}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          disabled={!dayDetails.pagination.hasPreviousPage || loadingDayDetails || !selectedDate}
          onClick={() => onChangePage(dayDetails.pagination.page - 1)}
        >
          Sebelumnya
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          disabled={!dayDetails.pagination.hasNextPage || loadingDayDetails || !selectedDate}
          onClick={() => onChangePage(dayDetails.pagination.page + 1)}
        >
          Seterusnya
        </Button>
      </div>
    </div>
  );
}
