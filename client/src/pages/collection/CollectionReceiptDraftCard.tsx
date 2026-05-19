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

  return (
    <article className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(220px,0.85fr)_minmax(300px,1.15fr)]">
        <div className="flex min-h-56 items-center justify-center border-b border-border/60 bg-muted/20 p-3 lg:border-b-0 lg:border-r">
          {preview.kind === "image" ? (
            safePreviewUrl ? (
              <img
                src={safePreviewUrl}
                alt={`Preview receipt ${index + 1}: ${preview.file.name}`}
                className="max-h-[18rem] w-full rounded-lg object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileImage className="h-9 w-9" />
                <Badge variant="secondary">Image</Badge>
              </div>
            )
          ) : preview.kind === "pdf" ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="h-9 w-9" />
              <Badge variant="secondary">PDF</Badge>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileImage className="h-9 w-9" />
              <Badge variant="outline">Preview unavailable</Badge>
            </div>
          )}
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
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
              <div className="grid gap-3 md:grid-cols-[minmax(8rem,0.8fr)_minmax(9rem,0.8fr)_minmax(14rem,1.4fr)]">
                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
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
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
