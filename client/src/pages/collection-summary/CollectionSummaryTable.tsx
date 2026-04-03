import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionMonthlySummary } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

export interface CollectionSummaryTableProps {
  loading: boolean;
  summaryRows: CollectionMonthlySummary[];
  selectedMonth: number | null;
  onSelectMonth: (month: number) => void;
}

export function CollectionSummaryTable({
  loading,
  summaryRows,
  selectedMonth,
  onSelectMonth,
}: CollectionSummaryTableProps) {
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="rounded-md border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        Loading summary...
      </div>
    );
  }

  return (
    <div className={`ops-table-shell ${isMobile ? "space-y-3 rounded-[1.5rem] p-3" : "p-3"}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className={isMobile ? "text-sm font-semibold" : "text-sm font-semibold"}>
            Monthly Navigation
          </p>
          <p className={`${isMobile ? "text-xs" : "text-xs"} text-muted-foreground`}>
            {isMobile
              ? "Tap a month to open its details."
              : "Klik nama bulan untuk buka popup senarai collection bagi bulan tersebut."}
          </p>
        </div>
      </div>

      <div className={`grid gap-2 ${isMobile ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
        {summaryRows.map((row) => {
          const active = selectedMonth === row.month;
          return (
            <Button
              key={row.month}
              type="button"
              variant={active ? "default" : "outline"}
              className={`h-auto items-start justify-between gap-3 text-left ${
                isMobile ? "rounded-2xl px-3 py-3.5" : "rounded-xl px-3 py-3"
              }`}
              onClick={() => onSelectMonth(row.month)}
            >
              <div className="space-y-1">
                <p className={isMobile ? "text-sm font-semibold" : "text-sm font-semibold"}>
                  {row.monthName}
                </p>
                <p className={`${isMobile ? "text-xs" : "text-xs"} opacity-80`}>
                  {row.totalRecords} record(s)
                </p>
              </div>
              <span className={isMobile ? "text-xs font-semibold" : "text-xs font-medium"}>
                {formatAmountRM(row.totalAmount)}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
