import { Suspense, lazy } from "react";
import { ChevronDown, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionRecord } from "@/lib/api";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { buildCollectionRecordRowAriaLabel } from "@/pages/collection-records/collection-record-row-aria";
import { getCollectionRecordSourceLabel } from "@/pages/collection-records/collection-source-label";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  formatCollectionOptionalAmount,
  getCollectionCpStatusLabel,
  getCollectionMatchAccuracyLabel,
} from "@/pages/collection-records/collection-coverage";
import { getCollectionCardNumberLabel } from "@/pages/collection-records/utils";
import { CollectionRecordActions } from "./CollectionRecordActions";

const CollectionRecordsDesktopTable = lazy(() =>
  import("@/pages/collection-records/CollectionRecordsDesktopTable").then((module) => ({
    default: module.CollectionRecordsDesktopTable,
  })),
);

export interface CollectionRecordsTableProps {
  loadingRecords: boolean;
  visibleRecords: CollectionRecord[];
  paginatedRecords: CollectionRecord[];
  pageOffset: number;
  canEdit: boolean;
  lastViewedRecordId?: string | null | undefined;
  onViewReceipt: (record: CollectionRecord, launcher?: HTMLElement) => void;
  onRecordDetailsToggle?: ((record: CollectionRecord, open: boolean) => void) | undefined;
  onEdit: (record: CollectionRecord, launcher?: HTMLElement) => void;
  onDelete: (record: CollectionRecord, launcher?: HTMLElement) => void;
  canDeleteRow: (record: CollectionRecord) => boolean;
}

function CollectionRecordsDesktopTableFallback() {
  return (
    <div role="status" className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
      Loading records table...
    </div>
  );
}

export function CollectionRecordsTable({
  loadingRecords,
  visibleRecords,
  paginatedRecords,
  pageOffset,
  canEdit,
  lastViewedRecordId = null,
  onViewReceipt,
  onRecordDetailsToggle,
  onEdit,
  onDelete,
  canDeleteRow,
}: CollectionRecordsTableProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="min-h-[180px] space-y-3">
        {loadingRecords ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Loading records...
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No collection records found for the current filters.
          </div>
        ) : (
          paginatedRecords.map((record, index) => (
            <article
              key={record.id}
              data-last-viewed={record.id === lastViewedRecordId ? "true" : undefined}
              aria-label={buildCollectionRecordRowAriaLabel({
                formattedAmount: formatAmountRM(record.amount),
                formattedPaymentDate: formatIsoDateToDDMMYYYY(record.paymentDate),
                record,
                recordNumber: pageOffset + index + 1,
              })}
              className="space-y-3 rounded-lg border border-border bg-card p-4 data-[last-viewed=true]:bg-muted data-[last-viewed=true]:shadow-[inset_3px_0_0_hsl(var(--primary))]"
              role="group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Record #{pageOffset + index + 1}
                    {record.id === lastViewedRecordId ? <span className="sr-only">Last opened record</span> : null}
                  </p>
                  <h3 className="break-words text-base font-semibold text-foreground">
                    {record.customerName}
                  </h3>
                  <p className="text-sm font-medium tabular-nums text-success">
                    {formatAmountRM(record.amount)}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {formatIsoDateToDDMMYYYY(record.paymentDate)}
                </p>
              </div>

              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Account Number</dt>
                  <dd className="break-all">{record.accountNumber || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Card Number</dt>
                  <dd className="break-all">{getCollectionCardNumberLabel(record.cardNumber)}</dd>
                </div>
              </dl>
              <details
                className="group border-t border-border"
                onToggle={(event) => onRecordDetailsToggle?.(record, event.currentTarget.open)}
              >
                <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-medium text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                  Record details
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
              <dl className="grid gap-3 pb-3 text-sm">
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">IC Number</dt>
                  <dd className="break-all">{record.icNumber || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">Customer Phone</dt>
                  <dd>{record.customerPhone || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">Batch</dt>
                  <dd>{record.batch || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">TOTAL DUE</dt>
                  <dd>{formatCollectionOptionalAmount(record.totalDue)}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">Billing Principal (OSP)</dt>
                  <dd>{formatCollectionOptionalAmount(record.billingPrincipalOsp)}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">CP Status</dt>
                  <dd className="font-medium">{getCollectionCpStatusLabel(record)}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">Aging / Match</dt>
                  <dd>{record.agingBucket || "-"} / {getCollectionMatchAccuracyLabel(record.sourceMatchAccuracy)}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">Staff Nickname</dt>
                  <dd>{record.collectionStaffNickname || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">Source File</dt>
                  <dd className="break-words">{getCollectionRecordSourceLabel(record)}</dd>
                </div>
              </dl>
              </details>

              <div className="flex flex-wrap items-center gap-2" data-floating-ai-avoid="true">
                {(record.receipts?.length || 0) > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 flex-1 justify-center rounded-md"
                    onClick={(event) => onViewReceipt(record, event.currentTarget)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    {(record.receipts?.length || 0) > 1 ? `View Receipt (${record.receipts.length})` : "View Receipt"}
                  </Button>
                ) : null}
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
              </div>
            </article>
          ))
        )}
      </div>
    );
  }

  return (
    <Suspense fallback={<CollectionRecordsDesktopTableFallback />}>
      <CollectionRecordsDesktopTable
        loadingRecords={loadingRecords}
        visibleRecords={visibleRecords}
        paginatedRecords={paginatedRecords}
        pageOffset={pageOffset}
        canEdit={canEdit}
        lastViewedRecordId={lastViewedRecordId}
        onViewReceipt={onViewReceipt}
        onEdit={onEdit}
        onDelete={onDelete}
        canDeleteRow={canDeleteRow}
      />
    </Suspense>
  );
}
