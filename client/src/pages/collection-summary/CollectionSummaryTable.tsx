import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getAriaSelectedProps } from "@/lib/aria-state-props";
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
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card" role="status" aria-label="Loading collection summary">
        <span className="sr-only">Loading summary...</span>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex h-11 items-center justify-between gap-4 border-b border-border px-3 last:border-0">
            <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="min-w-0 space-y-2" aria-label="Monthly collection totals">
      <p className="text-xs text-muted-foreground">Select a month to view its collection records.</p>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table aria-label="Monthly collection totals">
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead className="px-3">Month</TableHead>
            <TableHead className="px-3 text-right">Records</TableHead>
            <TableHead className="px-3 text-right">Total (RM)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
        {summaryRows.map((row) => {
          const active = selectedMonth === row.month;
          return (
            <TableRow key={row.month} data-state={active ? "selected" : undefined} {...getAriaSelectedProps(active)}>
              <TableCell className="p-0">
                <Button type="button" variant="ghost" className="h-11 w-full justify-start rounded-none px-3 font-medium"
                  aria-haspopup="dialog" onClick={() => onSelectMonth(row.month)}>
                  {row.monthName}
                </Button>
              </TableCell>
              <TableCell className="px-3 py-2 text-right">{row.totalRecords}</TableCell>
              <TableCell className="px-3 py-2 text-right font-medium">{formatAmountRM(row.totalAmount)}</TableCell>
            </TableRow>
          );
        })}
        </TableBody>
      </Table>
      </div>
    </section>
  );
}
