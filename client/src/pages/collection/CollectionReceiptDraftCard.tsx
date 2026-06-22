import { FileImage, FileText, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSafePreviewSourceUrl } from "@/lib/safe-url";
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
  const safePreviewUrl = resolveSafePreviewSourceUrl(preview.url);
  const amountInputId = `pending-receipt-amount-${index}`;
  const dateInputId = `pending-receipt-date-${index}`;
  const referenceInputId = `pending-receipt-reference-${index}`;
  const receiptPositionLabel = `Receipt ${index + 1} of ${Math.max(1, totalCount)}`;
  const hasPreviewDimensions = preview.width > 0 && preview.height > 0;
  const previewAspectRatio = hasPreviewDimensions
    ? `${preview.width} / ${preview.height}`
    : undefined;

  return (
    <article className="rounded-xl border border-border/70 bg-background shadow-sm">
      <div className="grid gap-0 overflow-hidden rounded-xl lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex min-h-72 items-center justify-center border-b border-border/60 bg-muted/20 p-4 lg:border-b-0 lg:border-r">
          {preview.kind === "image" ? (
            safePreviewUrl ? (
              <img
                src={safePreviewUrl}
                alt={`Preview receipt ${index + 1}: ${preview.file.name}`}
                width={hasPreviewDimensions ? preview.width : undefined}
                height={hasPreviewDimensions ? preview.height : undefined}
                className="h-auto max-h-[30rem] w-full rounded-lg object-contain"
                loading="lazy"
                decoding="async"
                style={previewAspectRatio ? { aspectRatio: previewAspectRatio } : undefined}
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
        </div>

        <div className="min-w-0 space-y-4 p-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{receiptPositionLabel}</Badge>
              <p className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">
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
