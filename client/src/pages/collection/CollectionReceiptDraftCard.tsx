import { useId, useState } from "react";
import { FileImage, FileText, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { resolveSafePreviewSourceUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";
import type {
  CollectionReceiptDraftPreview,
} from "@/pages/collection/useCollectionReceiptDraftPreviews";
import { formatCollectionReceiptFileSize } from "@/pages/collection/useCollectionReceiptDraftPreviews";
import type {
  CollectionReceiptPendingStatus,
  CollectionReceiptPendingStatusCopy,
} from "@/pages/collection/collection-receipt-pending-status";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";

interface CollectionReceiptDraftCardProps {
  preview: CollectionReceiptDraftPreview;
  index: number;
  totalCount: number;
  draft: CollectionReceiptDraftInput | undefined;
  disabled: boolean;
  pendingStatus: CollectionReceiptPendingStatus;
  pendingStatusCopy: CollectionReceiptPendingStatusCopy;
  willReplace: boolean;
  onDraftChange: ((index: number, patch: Partial<CollectionReceiptDraftInput>) => void) | undefined;
  onRemove: (index: number) => void;
}

export function CollectionReceiptDraftCard({
  preview,
  index,
  totalCount,
  draft,
  disabled,
  pendingStatus,
  pendingStatusCopy,
  willReplace,
  onDraftChange,
  onRemove,
}: CollectionReceiptDraftCardProps) {
  const previewId = useId();
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const safePreviewUrl = resolveSafePreviewSourceUrl(preview.url);
  const canExpandPreview = preview.kind === "image" && Boolean(safePreviewUrl);
  const expanded = canExpandPreview && previewExpanded;
  const amountInputId = `pending-receipt-amount-${index}`;
  const dateInputId = `pending-receipt-date-${index}`;
  const referenceInputId = `pending-receipt-reference-${index}`;
  const receiptPositionLabel = `Receipt ${index + 1} of ${Math.max(1, totalCount)}`;
  const hasPreviewDimensions = preview.width > 0 && preview.height > 0;
  const previewAspectRatio = hasPreviewDimensions
    ? `${preview.width} / ${preview.height}`
    : undefined;

  return (
    <article className="min-w-0 rounded-xl border border-border/70 bg-background shadow-sm" data-testid="receipt-draft-card">
      <div className={cn("grid min-w-0 gap-0 overflow-hidden rounded-xl", !expanded && "sm:grid-cols-[10rem_minmax(0,1fr)]")}>
        <div className={cn(
          "flex min-w-0 flex-wrap items-center justify-center gap-3 border-b border-border/60 bg-muted/20 p-3",
          expanded ? "flex-col" : "sm:flex-col sm:border-b-0 sm:border-r",
        )} data-testid="receipt-draft-preview">
          {preview.kind === "image" ? (
            safePreviewUrl ? (
              <img
                id={previewId}
                src={safePreviewUrl}
                alt={`Preview receipt ${index + 1}: ${preview.file.name}`}
                width={hasPreviewDimensions ? preview.width : undefined}
                height={hasPreviewDimensions ? preview.height : undefined}
                className={cn(
                  "min-w-0 rounded-lg object-contain",
                  expanded ? "h-auto max-h-[30rem] w-full" : "h-32 w-32 shrink-0",
                )}
                loading="lazy"
                decoding="async"
                style={expanded && previewAspectRatio ? { aspectRatio: previewAspectRatio } : undefined}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileImage className="h-9 w-9" aria-hidden="true" />
                <Badge variant="secondary">Image</Badge>
              </div>
            )
          ) : preview.kind === "pdf" ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="h-9 w-9" aria-hidden="true" />
              <Badge variant="secondary">PDF</Badge>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileImage className="h-9 w-9" aria-hidden="true" />
              <Badge variant="outline">Preview unavailable</Badge>
            </div>
          )}
          {canExpandPreview ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 shrink-0 sm:min-h-9"
              onClick={() => setPreviewExpanded((current) => !current)}
              disabled={disabled}
              aria-label={`${expanded ? "Kecilkan" : "Lihat besar"} resit ${index + 1}`}
              aria-controls={previewId}
              {...getAriaExpandedProps(expanded)}
            >
              {expanded ? "Kecilkan" : "Lihat besar"}
            </Button>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 p-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{receiptPositionLabel}</Badge>
              <p className="order-last min-w-0 basis-full break-words text-sm font-semibold text-foreground sm:order-none sm:basis-0 sm:flex-1">
                {preview.file.name}
              </p>
              <Badge variant={pendingStatusCopy.badgeVariant}>
                {pendingStatusCopy.badgeLabel}
              </Badge>
              {willReplace ? <Badge variant="secondary">Replacement</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {preview.file.type || "application/octet-stream"} |{" "}
              {formatCollectionReceiptFileSize(preview.file.size)}
            </p>
            {pendingStatus !== "pending" ? (
              <p className="text-xs text-muted-foreground">{pendingStatusCopy.helperText}</p>
            ) : null}
          </div>

          {draft ? (
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Receipt details
              </p>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-[minmax(9rem,0.8fr)_minmax(10rem,0.8fr)_minmax(16rem,1.4fr)]">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={amountInputId} className="text-xs">
                    Jumlah resit (RM)
                  </Label>
                  <Input
                    id={amountInputId}
                    name={`pendingReceiptAmount${index + 1}`}
                    value={draft.receiptAmount || ""}
                    onChange={(event) =>
                      onDraftChange?.(index, { receiptAmount: event.target.value })}
                    placeholder="Receipt Amount (RM)"
                    disabled={disabled}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={dateInputId} className="text-xs">
                    Tarikh resit
                  </Label>
                  <Input
                    id={dateInputId}
                    name={`pendingReceiptDate${index + 1}`}
                    type="date"
                    value={draft.receiptDate || ""}
                    onChange={(event) =>
                      onDraftChange?.(index, { receiptDate: event.target.value })}
                    disabled={disabled}
                    autoComplete="off"
                  />
                </div>
                <div className="min-w-0 space-y-1.5 sm:col-span-2 2xl:col-span-1">
                  <Label htmlFor={referenceInputId} className="text-xs">
                    Reference / no. transaksi
                  </Label>
                  <Input
                    id={referenceInputId}
                    name={`pendingReceiptReference${index + 1}`}
                    value={draft.receiptReference || ""}
                    onChange={(event) =>
                      onDraftChange?.(index, { receiptReference: event.target.value })}
                    placeholder="Receipt Reference"
                    disabled={disabled}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onRemove(index)}
              disabled={disabled}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Remove
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
