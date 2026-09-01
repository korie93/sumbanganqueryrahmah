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
import { formatCollectionMaskedCard } from "@/pages/collection-records/collection-coverage";
import type { CollectionMonthDetailsDialogProps } from "@/pages/collection-summary/CollectionMonthDetailsDialog";

type CollectionMonthDetailsDesktopTableProps = Pick<
  CollectionMonthDetailsDialogProps,
  "loading" | "records" | "page" | "pageSize" | "toDisplayDate"
>;

const stickyHeaderClassName = "sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur";

export function CollectionMonthDetailsDesktopTable({
  loading,
  records,
  page,
  pageSize,
  toDisplayDate,
}: CollectionMonthDetailsDesktopTableProps) {
  return (
    <Table className="min-w-[1080px] text-sm">
      <TableHeader>
        <TableRow>
          <TableHead className={stickyHeaderClassName}>No.</TableHead>
          <TableHead className={stickyHeaderClassName}>Date</TableHead>
          <TableHead className={stickyHeaderClassName}>Customer Name</TableHead>
          <TableHead className={stickyHeaderClassName}>IC Number</TableHead>
          <TableHead className={stickyHeaderClassName}>Customer Phone</TableHead>
          <TableHead className={stickyHeaderClassName}>Account Number</TableHead>
          <TableHead className={stickyHeaderClassName}>Card Number</TableHead>
          <TableHead className={stickyHeaderClassName}>Batch</TableHead>
          <TableHead className={stickyHeaderClassName}>Amount</TableHead>
          <TableHead className={stickyHeaderClassName}>Staff Nickname</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
              Loading monthly records...
            </TableCell>
          </TableRow>
        ) : records.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
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
                <TableCell>{row.accountNumber || "-"}</TableCell>
                <TableCell>{formatCollectionMaskedCard(row.cardNumberLast4)}</TableCell>
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
