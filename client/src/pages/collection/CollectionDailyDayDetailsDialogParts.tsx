import { Eye, FileText, Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionDailyDayDetailsResponse } from "@/lib/api";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@/lib/date-format";
import { cn } from "@/lib/utils";
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
) => void;

export function resolveTargetProgressPercent(amount: number, target: number) {
  if (target <= 0) {
    return amount > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((amount / target) * 100)));
}

export function getStatusPillClass(status: CollectionDayStatus) {
  if (status === "green") {
    return "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (status === "yellow") {
    return "border-amber-500/35 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (status === "red") {
    return "border-rose-500/35 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300";
  }
  return "border-slate-400/40 bg-slate-100 text-slate-700 dark:border-slate-500/40 dark:bg-slate-800/60 dark:text-slate-300";
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

export function CollectionDayMetric({
  icon: Icon,
  label,
  tone = "default",
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone?: CollectionDayMetricTone;
  value: string | number;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border px-3 py-2.5", getMetricToneClass(tone))}>
      <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-label-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate" title={label} aria-label={label}>
          {label}
        </span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground" title={String(value)} aria-label={String(value)}>
        {value}
      </div>
    </div>
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
    <dl className="min-w-0 rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
      <dt className="text-2xs font-semibold uppercase tracking-label-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium text-foreground">{value}</dd>
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
        <p className="collection-day-record-account">{record.accountNumber}</p>
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
    <div className="grid gap-2 text-sm md:grid-cols-3">
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Stored Receipts</span>
        </div>
        {record.receipts.length > 0 ? (
          <span className="collection-day-receipt-count">
            {record.receipts.length}
          </span>
        ) : null}
      </div>

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

            return (
              <Button
                key={receipt.id}
                type="button"
                size="sm"
                variant="outline"
                className="collection-day-receipt-button"
                aria-label={`View stored receipt ${receipt.originalFileName} for ${record.customerName}`}
                disabled={isLoadingReceipt}
                onClick={() => onViewReceipt(record, receipt.id)}
              >
                <span className="collection-day-receipt-icon" aria-hidden="true">
                  {isLoadingReceipt ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate font-medium"
                    title={receipt.originalFileName}
                    aria-label={receipt.originalFileName}
                  >
                    {receipt.originalFileName}
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
      className={cn("collection-day-record-card space-y-3", isMobile ? "rounded-2xl p-3.5" : "rounded-xl p-3.5")}
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
