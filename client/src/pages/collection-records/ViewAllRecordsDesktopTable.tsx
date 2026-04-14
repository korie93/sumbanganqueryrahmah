import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { buildCollectionRecordRowAriaLabel } from "@/pages/collection-records/collection-record-row-aria";
import { formatAmountRM } from "@/pages/collection/utils";
import type { ViewAllRecordsDialogProps } from "@/pages/collection-records/ViewAllRecordsDialog";

type ViewAllRecordsDesktopTableProps = Pick<
  ViewAllRecordsDialogProps,
  | "loading"
  | "viewAllRecords"
  | "page"
  | "pageSize"
  | "onViewReceipt"
>;

export function ViewAllRecordsDesktopTable({
  loading,
  viewAllRecords,
  page,
  pageSize,
  onViewReceipt,
}: ViewAllRecordsDesktopTableProps) {
  return (
    <Table className="min-w-[1100px] text-sm">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">No.</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Customer Name</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">IC Number</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Account Number</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Customer Phone Number</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Batch</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Amount</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Payment Date</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Receipt</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Staff Nickname</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={10} className="py-6 text-center text-muted-foreground">
              Loading full records...
            </TableCell>
          </TableRow>
        ) : viewAllRecords.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10} className="py-6 text-center text-muted-foreground">
              Tiada rekod dalam julat tarikh yang dipilih.
            </TableCell>
          </TableRow>
        ) : (
          viewAllRecords.map((record, index) => (
            <TableRow
              key={`view-all-${record.id}`}
              aria-label={buildCollectionRecordRowAriaLabel({
                formattedAmount: formatAmountRM(record.amount),
                formattedPaymentDate: formatIsoDateToDDMMYYYY(record.paymentDate),
                record,
                recordNumber: (page - 1) * pageSize + index + 1,
              })}
            >
              <TableCell className="py-2 text-muted-foreground">
                {(page - 1) * pageSize + index + 1}
              </TableCell>
              <TableCell className="py-2">{record.customerName}</TableCell>
              <TableCell className="py-2">{record.icNumber}</TableCell>
              <TableCell className="py-2">{record.accountNumber}</TableCell>
              <TableCell className="py-2">{record.customerPhone}</TableCell>
              <TableCell className="py-2">{record.batch}</TableCell>
              <TableCell className="py-2">{formatAmountRM(record.amount)}</TableCell>
              <TableCell className="py-2">{formatIsoDateToDDMMYYYY(record.paymentDate)}</TableCell>
              <TableCell className="py-2">
                {(record.receipts?.length || 0) > 0 ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0 text-primary"
                    onClick={() => onViewReceipt(record)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {(record.receipts?.length || 0) > 1 ? `View (${record.receipts.length})` : "View"}
                  </Button>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="py-2">{record.collectionStaffNickname}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
