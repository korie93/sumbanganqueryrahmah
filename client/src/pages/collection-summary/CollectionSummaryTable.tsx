import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionMonthlySummary } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

interface CollectionSummaryTableProps {
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
  return (
    <div className="rounded-md border border-border/60 overflow-hidden">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead>Total Records</TableHead>
            <TableHead>Total Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                Loading summary...
              </TableCell>
            </TableRow>
          ) : (
            summaryRows.map((row) => (
              <TableRow
                key={row.month}
                className={`cursor-pointer ${selectedMonth === row.month ? "bg-primary/10" : ""}`}
                onClick={() => onSelectMonth(row.month)}
              >
                <TableCell className="font-medium">{row.monthName}</TableCell>
                <TableCell>{row.totalRecords}</TableCell>
                <TableCell>{formatAmountRM(row.totalAmount)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
