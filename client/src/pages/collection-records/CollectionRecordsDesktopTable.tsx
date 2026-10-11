import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionRecordsTableProps } from "@/pages/collection-records/CollectionRecordsTable";
import { buildCollectionRecordRowAriaLabel } from "@/pages/collection-records/collection-record-row-aria";
import { getCollectionRecordSourceLabel } from "@/pages/collection-records/collection-source-label";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  formatCollectionOptionalAmount,
  getCollectionCpStatusLabel,
  getCollectionMatchAccuracyLabel,
} from "@/pages/collection-records/collection-coverage";
import { getCollectionCardNumberLabel } from "@/pages/collection-records/utils";
import { CollectionRecordActions } from "./CollectionRecordActions";
import "./CollectionRecordsDesktopTable.css";

type CollectionRecordsDesktopTableProps = CollectionRecordsTableProps & {
  viewMode?: "compact" | "full";
};

export function CollectionRecordsDesktopTable({
  loadingRecords,
  visibleRecords,
  paginatedRecords,
  pageOffset,
  canEdit,
  lastViewedRecordId = null,
  onViewReceipt,
  onEdit,
  onDelete,
  canDeleteRow,
  viewMode = "compact",
}: CollectionRecordsDesktopTableProps) {
  if (loadingRecords || visibleRecords.length === 0) {
    return (
      <div role="status" className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        {loadingRecords ? "Loading records..." : "No collection records found."}
      </div>
    );
  }

  const hasRowActions = canEdit || paginatedRecords.some(canDeleteRow);
  const isCompact = viewMode === "compact";
  const showActionsColumn = !isCompact || hasRowActions;

  return (
      <Table
        aria-label="Collection records"
        className={cn("text-sm", isCompact ? "collection-records-table--compact min-w-[64rem] table-fixed" : "min-w-[2140px]")}
        containerProps={{
          role: "region",
          "aria-label": "Collection records, scroll to view more columns and rows",
          className: cn("collection-records-table-scroll rounded-lg border border-border bg-card", isCompact && "collection-records-table-scroll--compact", hasRowActions && "collection-records-table-scroll--actions"),
        }}
      >
        <TableHeader>
          <TableRow>
            <TableHead className={cn("sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted", isCompact ? "w-16" : "w-[72px]")}>No.</TableHead>
            <TableHead className="collection-records-table-identity sticky top-0 border-b border-border/70 bg-muted">Customer Name</TableHead>
            {isCompact ? (
              <TableHead className="sticky top-0 z-[var(--z-sticky-header)] w-36 border-b border-border/70 bg-muted">Account / Card</TableHead>
            ) : <>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">IC Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Account Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Card Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Customer Phone Number</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Batch</TableHead>
            </>}
            <TableHead className={cn("sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted text-right", isCompact && "w-28")}>Amount</TableHead>
            {!isCompact ? <>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted text-right">TOTAL DUE</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted text-right">Billing Principal (OSP)</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">CP Status</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Aging</TableHead>
            <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Match</TableHead>
            </> : null}
            <TableHead className={cn("sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted", isCompact && "w-28")}>Payment Date</TableHead>
            <TableHead className={cn("sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted", isCompact && "w-28")}>Receipt</TableHead>
            <TableHead className={cn("sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted", isCompact && "w-28")}>Staff Nickname</TableHead>
            {!isCompact ? <TableHead className="sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted">Source File</TableHead> : null}
            {showActionsColumn ? <TableHead className={cn("sticky top-0 z-[var(--z-sticky-header)] border-b border-border/70 bg-muted text-right", hasRowActions && "collection-records-table-actions")}>Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedRecords.map((record, index) => (
              <TableRow
                key={record.id}
                data-last-viewed={record.id === lastViewedRecordId ? "true" : undefined}
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
                <TableCell className="collection-records-table-identity py-2 font-medium">
                  <span className={cn("block whitespace-normal wrap-anywhere", isCompact ? "w-full" : "w-56")}>{record.customerName}</span>
                  {record.id === lastViewedRecordId ? <span className="sr-only">Last opened record</span> : null}
                </TableCell>
                {isCompact ? (
                  <TableCell className="py-2">
                    <dl className="space-y-1.5 whitespace-normal wrap-anywhere">
                      <div>
                        <dt className="text-xs text-muted-foreground">Account</dt>
                        <dd>{record.accountNumber || "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Card</dt>
                        <dd>{getCollectionCardNumberLabel(record.cardNumber)}</dd>
                      </div>
                    </dl>
                  </TableCell>
                ) : <>
                <TableCell className="py-2 whitespace-nowrap">{record.icNumber}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.accountNumber || "-"}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{getCollectionCardNumberLabel(record.cardNumber)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.customerPhone}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.batch}</TableCell>
                </>}
                <TableCell className={cn("py-2 font-medium tabular-nums text-right text-foreground", isCompact ? "whitespace-normal wrap-anywhere" : "whitespace-nowrap")}>
                  {formatAmountRM(record.amount)}
                </TableCell>
                {!isCompact ? <>
                <TableCell className="py-2 whitespace-nowrap text-right tabular-nums">{formatCollectionOptionalAmount(record.totalDue)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap text-right tabular-nums">{formatCollectionOptionalAmount(record.billingPrincipalOsp)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap font-medium">{getCollectionCpStatusLabel(record)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{record.agingBucket || "-"}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">{getCollectionMatchAccuracyLabel(record.sourceMatchAccuracy)}</TableCell>
                </> : null}
                <TableCell className="py-2 whitespace-nowrap">{formatIsoDateToDDMMYYYY(record.paymentDate)}</TableCell>
                <TableCell className="py-2 whitespace-nowrap">
                  {(record.receipts?.length || 0) > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn("h-9 rounded-md px-3 text-foreground", isCompact && "h-auto min-h-9 max-w-full whitespace-normal px-2 [&>svg]:shrink-0")}
                      onClick={(event) => onViewReceipt(record, event.currentTarget)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      {(record.receipts?.length || 0) > 1 ? `View (${record.receipts.length})` : "View"}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className={cn("py-2", isCompact ? "whitespace-normal wrap-anywhere" : "whitespace-nowrap")}>{record.collectionStaffNickname}</TableCell>
                {!isCompact ? <TableCell className="max-w-[240px] truncate py-2" title={getCollectionRecordSourceLabel(record)}>
                  {getCollectionRecordSourceLabel(record)}
                </TableCell> : null}
                {showActionsColumn ? <TableCell className={cn("py-2 text-right whitespace-nowrap", hasRowActions && "collection-records-table-actions")}>
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
                </TableCell> : null}
              </TableRow>
            ))}
        </TableBody>
      </Table>
  );
}
