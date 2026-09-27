import { Eye } from "lucide-react";
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
import { getCollectionCardNumberLabel } from "@/pages/collection-records/utils";
import { CollectionRecordActions } from "./CollectionRecordActions";

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
    <div className="min-h-[420px] max-h-[64vh] overflow-auto rounded-lg border border-border bg-card">
      <Table className="min-w-[2140px] text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] w-[72px] border-b border-border/70 bg-muted">No.</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Customer Name</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">IC Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Account Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Card Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Customer Phone Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Batch</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted text-right">Amount</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted text-right">TOTAL DUE</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted text-right">Billing Principal (OSP)</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">CP Status</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Aging</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Match</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Payment Date</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Receipt</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Staff Nickname</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Source File</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadingRecords ? (
            <TableRow>
              <TableCell colSpan={18} className="text-center text-muted-foreground py-6">
                Loading records...
              </TableCell>
            </TableRow>
          ) : visibleRecords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={18} className="text-center text-muted-foreground py-6">
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
                <TableCell className="py-2 whitespace-nowrap">{record.accountNumber || "-"}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{getCollectionCardNumberLabel(record.cardNumber)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.customerPhone}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.batch}</TableCell>
                <TableCell className="py-2 whitespace-nowrap font-medium tabular-nums text-right text-success">
                  {formatAmountRM(record.amount)}
                </TableCell>
                <TableCell className="py-2 whitespace-nowrap text-right tabular-nums">{formatCollectionOptionalAmount(record.totalDue)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap text-right tabular-nums">{formatCollectionOptionalAmount(record.billingPrincipalOsp)}</TableCell>
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
                      className="h-8 rounded-md px-3 text-foreground"
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
                  {canEdit || canDeleteRow(record) ? (
                    <CollectionRecordActions
                      record={record}
                      recordNumber={pageOffset + index + 1}
                      canEdit={canEdit}
                      canDelete={canDeleteRow(record)}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
