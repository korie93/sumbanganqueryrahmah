import { Edit3, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionRecordsTableProps } from "@/pages/collection-records/CollectionRecordsTable";
import { buildCollectionRecordRowAriaLabel } from "@/pages/collection-records/collection-record-row-aria";
import { getCollectionRecordSourceLabel } from "@/pages/collection-records/collection-source-label";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  formatCollectionOptionalAmount,
  getCollectionCpStatusLabel,
  getCollectionMatchAccuracyLabel,
} from "@/pages/collection-records/collection-coverage";

type CollectionRecordsDesktopTableProps = CollectionRecordsTableProps;

export function CollectionRecordsDesktopTable({
  loadingRecords,
  visibleRecords,
  paginatedRecords,
  pageOffset,
  canEdit,
  onViewReceipt,
  onEdit,
  onDelete,
  canDeleteRow,
}: CollectionRecordsDesktopTableProps) {
  return (
    <div className="min-h-[420px] max-h-[64vh] overflow-auto rounded-[1.5rem] border border-border/60 bg-background shadow-sm">
      <Table className="min-w-[2020px] text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] w-[72px] border-b border-border/70 bg-background/95 sqr-backdrop-blur">No.</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Customer Name</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">IC Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Account Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Customer Phone Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Batch</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Amount</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">TOTAL DUE</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Billing Principal (OSP)</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">CP Status</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Aging</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Match</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Payment Date</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Receipt</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Staff Nickname</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 sqr-backdrop-blur">Source File</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 text-right sqr-backdrop-blur">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadingRecords ? (
            <TableRow>
              <TableCell colSpan={17} className="text-center text-muted-foreground py-6">
                Loading records...
              </TableCell>
            </TableRow>
          ) : visibleRecords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={17} className="text-center text-muted-foreground py-6">
                No collection records found.
              </TableCell>
            </TableRow>
          ) : (
            paginatedRecords.map((record, index) => (
              <TableRow
                key={record.id}
                aria-label={buildCollectionRecordRowAriaLabel({
                  formattedAmount: formatAmountRM(record.amount),
                  formattedPaymentDate: formatIsoDateToDDMMYYYY(record.paymentDate),
                  record,
                  recordNumber: pageOffset + index + 1,
                })}
              >
                <TableCell className="py-2 text-muted-foreground">
                  {pageOffset + index + 1}
                </TableCell>
                <TableCell className="py-2 font-medium">{record.customerName}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.icNumber}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.accountNumber}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.customerPhone}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.batch}</TableCell>
                <TableCell className="py-2 whitespace-nowrap font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatAmountRM(record.amount)}
                </TableCell>
                <TableCell className="py-2 whitespace-nowrap">{formatCollectionOptionalAmount(record.totalDue)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{formatCollectionOptionalAmount(record.billingPrincipalOsp)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap font-medium">{getCollectionCpStatusLabel(record)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.agingBucket || "-"}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{getCollectionMatchAccuracyLabel(record.sourceMatchAccuracy)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{formatIsoDateToDDMMYYYY(record.paymentDate)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">
                  {(record.receipts?.length || 0) > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-foreground"
                      onClick={() => onViewReceipt(record)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      {(record.receipts?.length || 0) > 1 ? `View (${record.receipts.length})` : "View"}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.collectionStaffNickname}</TableCell>
                <TableCell className="max-w-[240px] truncate py-2" title={getCollectionRecordSourceLabel(record)}>
                  {getCollectionRecordSourceLabel(record)}
                </TableCell>
                <TableCell className="py-2 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-2">
                    {canEdit ? (
                      <Button type="button" size="sm" variant="outline" className="h-8 rounded-full px-3" onClick={() => onEdit(record)}>
                        <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    ) : null}
                    {canDeleteRow(record) ? (
                      <Button type="button" size="sm" variant="destructive" className="h-8 rounded-full px-3" onClick={() => onDelete(record)}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
