import { Eye, FileText, Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionDailyDayDetailsResponse } from "@/lib/api";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { formatCollectionReceiptFileName } from "@/pages/collection/collection-receipt-panel-utils";
import { buildCollectionDailyReceiptKey } from "@/pages/collection/useCollectionDailyReceiptViewer";
import { formatCollectionReceiptFileSize } from "@/pages/collection/useCollectionReceiptDraftPreviews";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDayStatus = CollectionDailyDayDetailsResponse["status"];
type CollectionDayMetricTone = "default" | "success" | "warning" | "danger";
type CollectionDailyDayRecord = CollectionDailyDayDetailsResponse["records"][number];
type CollectionDailyDayReceipt = CollectionDailyDayRecord["receipts"][number];
type CollectionDailyReceiptOpenHandler = (
  record: CollectionDailyDayRecord,
  receiptId?: string,
  trigger?: HTMLElement,
) => void;

export function resolveTargetProgressPercent(amount: number, target: number) {
  if (target <= 0) {
    return amount > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((amount / target) * 100)));
}

export function getProgressBarClass(status: CollectionDayStatus) {
  if (status === "green") return "collection-day-target-progress--success";
  if (status === "yellow") return "collection-day-target-progress--warning";
  if (status === "red") return "collection-day-target-progress--danger";
  return "collection-day-target-progress--neutral";
}

function getMetricToneClass(tone: CollectionDayMetricTone) {
  if (tone === "success") return "border-emerald-500/25 bg-emerald-50/80 dark:bg-emerald-500/10";
  if (tone === "warning") return "border-amber-500/25 bg-amber-50/80 dark:bg-amber-500/10";
  if (tone === "danger") return "border-rose-500/25 bg-rose-50/80 dark:bg-rose-500/10";
  return "border-border/60 bg-muted/10";
}

function formatMetricValueLabel(value: string | number) {
  const normalized = String(value).trim();
  return normalized || "No value";
}

export function CollectionDayMetric({
  icon: Icon,
  label,
  tone = "default",
  value,
  className,
}: {
  icon: LucideIcon;
  label: string;
  tone?: CollectionDayMetricTone;
  value: string | number;
  className?: string;
}) {
  const valueLabel = formatMetricValueLabel(value);

  return (
    <dl className={cn("collection-day-metric", getMetricToneClass(tone), className)}>
      <dt className="collection-day-metric-label">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </dt>
      <dd className="collection-day-metric-value">{valueLabel}</dd>
    </dl>
  );
}

function CollectionRecordDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <dl className="collection-day-record-detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </dl>
  );
}

function CollectionRecordMetaPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="collection-day-record-meta-pill">
      <span className="collection-day-record-meta-label">{label}</span>
      <span className="collection-day-record-meta-value">{value}</span>
    </span>
  );
}

function CollectionRecordHeader({ record }: { record: CollectionDailyDayRecord }) {
  return (
    <div className="collection-day-record-header">
      <div className="min-w-0 space-y-1">
        <p className="collection-day-record-title">{record.customerName}</p>
        <p className="collection-day-record-account"><span className="sr-only">Account: </span>{record.accountNumber}</p>
      </div>
      <span className="collection-day-record-amount">{formatAmountRM(record.amount)}</span>
    </div>
  );
}

function CollectionRecordMeta({ record }: { record: CollectionDailyDayRecord }) {
  return (
    <div className="collection-day-record-meta">
      <CollectionRecordMetaPill label="User" value={record.username} />
      <CollectionRecordMetaPill label="Nickname" value={record.collectionStaffNickname} />
      <CollectionRecordMetaPill label="Batch" value={record.batch} />
    </div>
  );
}

function CollectionRecordDetailsGrid({ record }: { record: CollectionDailyDayRecord }) {
  return (
    <div className="collection-day-record-details-grid">
      <CollectionRecordDetail label="Reference" value={record.paymentReference} />
      <CollectionRecordDetail label="Payment Date" value={formatDateDDMMYYYY(record.paymentDate)} />
      <CollectionRecordDetail label="Created" value={formatDateTimeDDMMYYYY(record.createdAt)} />
    </div>
  );
}

function getReceiptTypeLabel(receipt: CollectionDailyDayReceipt) {
  const mimeType = receipt.originalMimeType.toLowerCase();
  if (mimeType.includes("pdf") || receipt.originalFileName.toLowerCase().endsWith(".pdf")) {
    return "PDF";
  }
  if (mimeType.startsWith("image/")) {
    return "Image";
  }
  return "File";
}

function CollectionStoredReceipts({
  loadingReceiptKey,
  onViewReceipt,
  record,
}: {
  loadingReceiptKey: string | null;
  onViewReceipt: CollectionDailyReceiptOpenHandler;
  record: CollectionDailyDayRecord;
}) {
  return (
    <section className="collection-day-receipts-panel" aria-label={`Stored receipts for ${record.customerName}`}>
      {record.receipts.length > 0 ? <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Stored Receipts</span>
        </div>
        {record.receipts.length > 0 ? (
          <span className="collection-day-receipt-count">
            {record.receipts.length}
          </span>
        ) : null}
      </div> : null}

      {record.receipts.length === 0 ? (
        <div className="collection-day-receipt-empty">
          No stored receipt for this record.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-floating-ai-avoid="true">
          {record.receipts.map((receipt) => {
            const key = buildCollectionDailyReceiptKey(record.id, receipt.id);
            const isLoadingReceipt = loadingReceiptKey === key;
            const receiptTypeLabel = getReceiptTypeLabel(receipt);
            const receiptFileName = formatCollectionReceiptFileName(
              receipt.originalFileName,
            );

            return (
              <Button
                key={receipt.id}
                type="button"
                size="sm"
                variant="outline"
                className="collection-day-receipt-button"
                aria-label={`View stored receipt ${receiptFileName} for ${record.customerName}`}
                disabled={isLoadingReceipt}
                onClick={(event) => onViewReceipt(record, receipt.id, event.currentTarget)}
              >
                <span className="collection-day-receipt-icon" aria-hidden="true">
                  {isLoadingReceipt ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate font-medium"
                    title={receiptFileName}
                    aria-label={receiptFileName}
                  >
                    {receiptFileName}
                  </span>
                  <span className="block truncate text-2xs font-normal text-muted-foreground">
                    {receiptTypeLabel} · {formatCollectionReceiptFileSize(receipt.fileSize)}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CollectionDailyRecordCard({
  isMobile,
  loadingReceiptKey,
  onViewReceipt,
  record,
}: {
  isMobile: boolean;
  loadingReceiptKey: string | null;
  onViewReceipt: CollectionDailyReceiptOpenHandler;
  record: CollectionDailyDayRecord;
}) {
  return (
    <div
      className={cn("collection-day-record-card", isMobile && "collection-day-record-card--mobile")}
    >
      <CollectionRecordHeader record={record} />
      <CollectionRecordMeta record={record} />
      <CollectionRecordDetailsGrid record={record} />
      <CollectionStoredReceipts
        loadingReceiptKey={loadingReceiptKey}
        onViewReceipt={onViewReceipt}
        record={record}
      />
    </div>
  );
}
