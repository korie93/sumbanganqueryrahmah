import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmountRM } from "@/pages/collection/utils";
import { buildCollectionMonthDetailsRowAriaLabel } from "@/pages/collection-summary/collection-summary-row-aria";
import type { CollectionMonthDetailsDialogProps } from "@/pages/collection-summary/CollectionMonthDetailsDialog";

type CollectionMonthDetailsDesktopTableProps = Pick<
  CollectionMonthDetailsDialogProps,
  "loading" | "records" | "page" | "pageSize" | "toDisplayDate"
>;

export function CollectionMonthDetailsDesktopTable({
  loading,
  records,
  page,
  pageSize,
  toDisplayDate,
}: CollectionMonthDetailsDesktopTableProps) {
  return (
    <Table className="min-w-[980px] text-sm">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">No.</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Date</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Customer Name</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">IC Number</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Customer Phone</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Account Number</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Batch</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Amount</TableHead>
          <TableHead className="sticky top-0 z-[var(--z-sticky-header)] bg-background">Staff Nickname</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
              Loading monthly records...
            </TableCell>
          </TableRow>
        ) : records.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
              Tiada rekod kutipan untuk bulan yang dipilih.
            </TableCell>
          </TableRow>
        ) : (
          records.map((row, index) => {
            const recordIndex = (page - 1) * pageSize + index + 1;
            const formattedPaymentDate = toDisplayDate(row.paymentDate);
            const formattedAmount = formatAmountRM(row.amount);

            return (
              <TableRow
                key={row.id}
                aria-label={buildCollectionMonthDetailsRowAriaLabel({
                  formattedAmount,
                  formattedPaymentDate,
                  index: recordIndex,
                  record: row,
                })}
              >
                <TableCell>{recordIndex}</TableCell>
                <TableCell>{formattedPaymentDate}</TableCell>
                <TableCell className="font-medium">{row.customerName}</TableCell>
                <TableCell>{row.icNumber}</TableCell>
                <TableCell>{row.customerPhone}</TableCell>
                <TableCell>{row.accountNumber}</TableCell>
                <TableCell>{row.batch}</TableCell>
                <TableCell>{formattedAmount}</TableCell>
                <TableCell>{row.collectionStaffNickname}</TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
