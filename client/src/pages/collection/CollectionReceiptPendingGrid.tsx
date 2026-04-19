import { FileImage, FileText, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveSafePreviewSourceUrl } from "@/lib/safe-url";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import {
  formatCollectionReceiptFileSize,
  type CollectionReceiptDraftPreview,
} from "@/pages/collection/useCollectionReceiptDraftPreviews";

type CollectionReceiptPendingGridProps = {
  disabled: boolean;
  draftPreviews: CollectionReceiptDraftPreview[];
  failedImagePreviewKeys: ReadonlySet<string>;
  onMarkImagePreviewFailed: (key: string) => void;
  onPendingDraftChange?: (index: number, patch: Partial<CollectionReceiptDraftInput>) => void;
  onRemovePending: (index: number) => void;
  pendingReceiptDrafts: CollectionReceiptDraftInput[];
  willReplace: boolean;
};

export function CollectionReceiptPendingGrid({
  disabled,
  draftPreviews,
  failedImagePreviewKeys,
  onMarkImagePreviewFailed,
  onPendingDraftChange,
  onRemovePending,
  pendingReceiptDrafts,
  willReplace,
}: CollectionReceiptPendingGridProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Pending Receipts
      </p>
      {draftPreviews.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
          No pending receipt selected yet.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {draftPreviews.map((preview, index) => {
            const safePreviewUrl = resolveSafePreviewSourceUrl(preview.url);
            const imagePreviewFailed = failedImagePreviewKeys.has(preview.key);

            return (
              <div
                key={preview.key}
                className="overflow-hidden rounded-md border border-border/60 bg-background/60"
              >
                <div className="flex h-36 items-center justify-center bg-muted/20">
                  {preview.kind === "image" ? (
                    safePreviewUrl ? (
                      imagePreviewFailed ? (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileImage className="h-8 w-8" />
                          <Badge variant="outline">Preview unavailable</Badge>
                        </div>
                      ) : (
                        <img
                          src={safePreviewUrl}
                          alt={`Receipt preview for ${preview.file.name}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          onError={() => onMarkImagePreviewFailed(preview.key)}
                        />
                      )
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileImage className="h-8 w-8" />
                        <Badge variant="secondary">Image</Badge>
                      </div>
                    )
                  ) : preview.kind === "pdf" ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <Badge variant="secondary">PDF</Badge>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileImage className="h-8 w-8" />
                      <Badge variant="outline">Preview unavailable</Badge>
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{preview.file.name}</p>
                      <Badge variant="outline">Pending Upload</Badge>
                      {willReplace ? (
                        <Badge variant="secondary">Replacement</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {preview.file.type || "application/octet-stream"} |{" "}
                      {formatCollectionReceiptFileSize(preview.file.size)}
                    </p>
                  </div>
                  {pendingReceiptDrafts[index] ? (
                    <div className="grid gap-2">
                      <Input
                        id={`pending-receipt-amount-${index}`}
                        name={`pendingReceiptAmount${index + 1}`}
                        value={pendingReceiptDrafts[index]?.receiptAmount || ""}
                        onChange={(event) =>
                          onPendingDraftChange?.(index, { receiptAmount: event.target.value })}
                        placeholder="Receipt Amount (RM)"
                        aria-label={`Receipt amount for pending file ${preview.file.name}`}
                        disabled={disabled}
                        inputMode="decimal"
                        autoComplete="off"
                      />
                      <div className="grid gap-2 md:grid-cols-2">
                        <Input
                          id={`pending-receipt-date-${index}`}
                          name={`pendingReceiptDate${index + 1}`}
                          type="date"
                          value={pendingReceiptDrafts[index]?.receiptDate || ""}
                          onChange={(event) =>
                            onPendingDraftChange?.(index, { receiptDate: event.target.value })}
                          aria-label={`Receipt date for pending file ${preview.file.name}`}
                          disabled={disabled}
                          autoComplete="off"
                        />
                        <Input
                          id={`pending-receipt-reference-${index}`}
                          name={`pendingReceiptReference${index + 1}`}
                          value={pendingReceiptDrafts[index]?.receiptReference || ""}
                          onChange={(event) =>
                            onPendingDraftChange?.(index, { receiptReference: event.target.value })}
                          placeholder="Receipt Reference"
                          aria-label={`Receipt reference for pending file ${preview.file.name}`}
                          disabled={disabled}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemovePending(index)}
                      disabled={disabled}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
