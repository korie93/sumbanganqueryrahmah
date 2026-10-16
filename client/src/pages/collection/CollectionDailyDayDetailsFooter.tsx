import { Button } from "@/components/ui/button";
import type { CollectionDailyDayDetailsResponse } from "@/lib/api";

type CollectionDailyDayDetailsFooterProps = {
  dayDetails: CollectionDailyDayDetailsResponse | null;
  isMobile: boolean;
  loadingDayDetails: boolean;
  hasError?: boolean;
  onChangePage: (page: number) => void;
  recordRangeLabel: string;
  selectedDate: string | null;
};

export function CollectionDailyDayDetailsFooter({
  dayDetails,
  isMobile,
  loadingDayDetails,
  hasError = false,
  onChangePage,
  recordRangeLabel,
  selectedDate,
}: CollectionDailyDayDetailsFooterProps) {
  return (
    <nav
      className="collection-day-pagination"
      aria-label="Navigasi halaman rekod kutipan harian"
      data-floating-ai-avoid="true"
    >
      <div className="collection-day-pagination-range" aria-live="polite" aria-atomic="true">
        <span>{loadingDayDetails ? "Memuatkan halaman rekod..." : hasError ? "Halaman rekod gagal dimuatkan" : recordRangeLabel}</span>
        <span>{dayDetails ? `${hasError ? "Halaman terakhir dimuatkan:" : "Halaman"} ${dayDetails.pagination.page} daripada ${dayDetails.pagination.totalPages}` : "Halaman belum tersedia"}</span>
      </div>
      <div className="collection-day-pagination-buttons">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={isMobile ? "min-h-11" : "min-h-10"}
          disabled={!dayDetails?.pagination.hasPreviousPage || loadingDayDetails || !selectedDate}
          onClick={() => { if (dayDetails) onChangePage(dayDetails.pagination.page - 1); }}
        >
          Sebelumnya
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={isMobile ? "min-h-11" : "min-h-10"}
          disabled={!dayDetails?.pagination.hasNextPage || loadingDayDetails || !selectedDate}
          onClick={() => { if (dayDetails) onChangePage(dayDetails.pagination.page + 1); }}
        >
          Seterusnya
        </Button>
      </div>
    </nav>
  );
}
