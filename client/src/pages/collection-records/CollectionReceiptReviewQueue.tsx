import { AlertTriangle, Eye, FileWarning, PencilLine } from "lucide-react";
import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import type { CollectionRecord } from "@/lib/api";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { CollectionReceiptValidationBadge } from "@/pages/collection/CollectionReceiptValidationBadge";
import type { CollectionReceiptReviewSummary } from "@/pages/collection/collection-receipt-status";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionReceiptReviewQueueProps = {
  summary: CollectionReceiptReviewSummary;
  canEdit: boolean;
  onEdit: (record: CollectionRecord) => void;
  onViewReceipt: (record: CollectionRecord) => void;
};

export function CollectionReceiptReviewQueue({
  summary,
  canEdit,
  onEdit,
  onViewReceipt,
}: CollectionReceiptReviewQueueProps) {
  if (summary.flaggedCount === 0) {
    return null;
  }

  const highlightedRecords = summary.flaggedRecords.slice(0, 6);

  return (
    <OperationalSectionCard
      title="Receipt Review Queue"
      description="Prioritise records that need receipt verification, mismatch correction, or duplicate checking before they become operational noise."
      badge={
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
          <FileWarning className="h-3.5 w-3.5" />
          {summary.flaggedCount} needs action
        </div>
      }
      contentClassName="space-y-4"
    >
      <OperationalSummaryStrip className="grid gap-3 md:grid-cols-3">
        <OperationalMetric
          label="Mismatch"
          value={summary.mismatchCount}
          supporting="Underpaid or overpaid records"
          tone={summary.mismatchCount > 0 ? "danger" : "default"}
        />
        <OperationalMetric
          label="Needs Review"
          value={summary.needsAttentionCount}
          supporting="Includes unverified and OCR review cases"
          tone={summary.needsAttentionCount > 0 ? "warning" : "default"}
        />
        <OperationalMetric
          label="Duplicate Warnings"
          value={summary.duplicateWarningCount}
          supporting="Possible repeated receipt uploads"
          tone={summary.duplicateWarningCount > 0 ? "warning" : "default"}
        />
      </OperationalSummaryStrip>

      <div className="grid gap-3 xl:grid-cols-2">
        {highlightedRecords.map((record) => (
          <div
            key={record.id}
            className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-semibold text-foreground">{record.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  {record.accountNumber} · {formatIsoDateToDDMMYYYY(record.paymentDate)}
                </p>
              </div>
              <CollectionReceiptValidationBadge
                status={record.receiptValidationStatus}
                duplicateFlag={record.duplicateReceiptFlag}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Paid</p>
                <p className="text-sm font-semibold">{formatAmountRM(record.amount)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipt Total</p>
                <p className="text-sm font-semibold">{formatAmountRM(record.receiptTotalAmount)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipt Count</p>
                <p className="text-sm font-semibold">{record.receiptCount}</p>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{record.receiptValidationMessage || "Receipt verification still needs operational review."}</p>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {(record.receipts?.length || 0) > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onViewReceipt(record)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Receipt
                </Button>
              ) : null}
              {canEdit ? (
                <Button type="button" size="sm" onClick={() => onEdit(record)}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Review Record
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {summary.flaggedCount > highlightedRecords.length ? (
        <p className="text-xs text-muted-foreground">
          Showing {highlightedRecords.length} of {summary.flaggedCount} flagged records in the current result set.
          Use the records table below for the full list.
        </p>
      ) : null}
    </OperationalSectionCard>
  );
}
