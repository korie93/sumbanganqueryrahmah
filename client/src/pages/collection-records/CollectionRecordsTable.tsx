import { Suspense, lazy } from "react";
import { Edit3, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionRecord } from "@/lib/api";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { buildCollectionRecordRowAriaLabel } from "@/pages/collection-records/collection-record-row-aria";
import { formatAmountRM } from "@/pages/collection/utils";

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
  onViewReceipt: (record: CollectionRecord) => void;
  onEdit: (record: CollectionRecord) => void;
  onDelete: (record: CollectionRecord) => void;
  canDeleteRow: (record: CollectionRecord) => boolean;
}

function CollectionRecordsDesktopTableFallback() {
  return (
    <div className="min-h-[420px] max-h-[64vh] overflow-auto rounded-[1.5rem] border border-border/60 bg-background px-4 py-6 text-center text-sm text-muted-foreground shadow-sm">
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
  onViewReceipt,
  onEdit,
  onDelete,
  canDeleteRow,
}: CollectionRecordsTableProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="min-h-[320px] space-y-3 rounded-[1.5rem] border border-border/60 bg-background p-3 shadow-sm">
        {loadingRecords ? (
          <div className="rounded-2xl border border-border/60 bg-background px-4 py-6 text-center text-sm text-muted-foreground shadow-sm">
            Loading records...
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-background px-4 py-6 text-center text-sm text-muted-foreground shadow-sm">
            No collection records found for the current filters.
          </div>
        ) : (
          paginatedRecords.map((record, index) => (
            <article
              key={record.id}
              aria-label={buildCollectionRecordRowAriaLabel({
                formattedAmount: formatAmountRM(record.amount),
                formattedPaymentDate: formatIsoDateToDDMMYYYY(record.paymentDate),
                record,
                recordNumber: pageOffset + index + 1,
              })}
              className="space-y-3 rounded-2xl border border-border/70 bg-background p-4 shadow-sm"
              role="group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Record #{pageOffset + index + 1}
                  </p>
                  <h3 className="break-words text-base font-semibold text-foreground">
                    {record.customerName}
                  </h3>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">
                    {formatAmountRM(record.amount)}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {formatIsoDateToDDMMYYYY(record.paymentDate)}
                </p>
              </div>

              <dl className="grid gap-2 rounded-xl border border-border/60 bg-muted/10 p-3 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">IC Number</dt>
                  <dd className="break-all">{record.icNumber || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Account Number</dt>
                  <dd className="break-all">{record.accountNumber || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Customer Phone</dt>
                  <dd>{record.customerPhone || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Batch</dt>
                  <dd>{record.batch || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Staff Nickname</dt>
                  <dd>{record.collectionStaffNickname || "-"}</dd>
                </div>
              </dl>

              <div className="flex flex-col gap-2" data-floating-ai-avoid="true">
                {(record.receipts?.length || 0) > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-center rounded-xl"
                    onClick={() => onViewReceipt(record)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    {(record.receipts?.length || 0) > 1 ? `View Receipt (${record.receipts.length})` : "View Receipt"}
                  </Button>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {canEdit ? (
                    <Button
                      type="button"
                      className="h-10 w-full rounded-xl sm:w-auto"
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(record)}
                    >
                      <Edit3 className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                  {canDeleteRow(record) ? (
                    <Button
                      type="button"
                      className="h-10 w-full rounded-xl sm:w-auto"
                      size="sm"
                      variant="destructive"
                      onClick={() => onDelete(record)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  ) : null}
                </div>
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
        onViewReceipt={onViewReceipt}
        onEdit={onEdit}
        onDelete={onDelete}
        canDeleteRow={canDeleteRow}
      />
    </Suspense>
  );
}
