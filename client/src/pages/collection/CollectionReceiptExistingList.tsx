import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollectionRecordReceipt } from "@/lib/api";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import { formatCollectionReceiptFileSize } from "@/pages/collection/useCollectionReceiptDraftPreviews";

type CollectionReceiptExistingListProps = {
  disabled: boolean;
  existingReceiptDrafts: CollectionReceiptDraftInput[];
  existingReceipts: CollectionRecordReceipt[];
  onExistingDraftChange?: (receiptId: string, patch: Partial<CollectionReceiptDraftInput>) => void;
  onToggleRemoveExisting?: (receiptId: string) => void;
  onViewExisting?: (receipt: CollectionRecordReceipt) => void;
  removedReceiptIds: string[];
};

export function CollectionReceiptExistingList({
  disabled,
  existingReceiptDrafts,
  existingReceipts,
  onExistingDraftChange,
  onToggleRemoveExisting,
  onViewExisting,
  removedReceiptIds,
}: CollectionReceiptExistingListProps) {
  const removedSet = new Set(removedReceiptIds);
  const existingDraftMap = new Map(
    existingReceiptDrafts
      .filter((draft) => Boolean(String(draft.receiptId || "").trim()))
      .map((draft) => [String(draft.receiptId), draft]),
  );

  if (existingReceipts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Existing Receipts
      </p>
      <div className="space-y-2">
        {existingReceipts.map((receipt) => {
          const markedForRemoval = removedSet.has(receipt.id);
          const existingDraft = existingDraftMap.get(receipt.id);

          return (
            <div
              key={receipt.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                markedForRemoval ? "border-destructive/40 bg-destructive/5" : "border-border/60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{receipt.originalFileName}</p>
                  <Badge variant={markedForRemoval ? "destructive" : "secondary"}>
                    {markedForRemoval ? "Will Remove" : "Existing"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {receipt.originalMimeType} | {formatCollectionReceiptFileSize(receipt.fileSize)}
                </p>
                {existingDraft ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <Input
                      id={`existing-receipt-amount-${receipt.id}`}
                      name={`existingReceiptAmount${receipt.id}`}
                      value={existingDraft.receiptAmount || ""}
                      onChange={(event) =>
                        onExistingDraftChange?.(receipt.id, { receiptAmount: event.target.value })}
                      placeholder="Receipt Amount (RM)"
                      aria-label={`Receipt amount for ${receipt.originalFileName}`}
                      disabled={disabled || markedForRemoval}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <Input
                      id={`existing-receipt-date-${receipt.id}`}
                      name={`existingReceiptDate${receipt.id}`}
                      type="date"
                      value={existingDraft.receiptDate || ""}
                      onChange={(event) =>
                        onExistingDraftChange?.(receipt.id, { receiptDate: event.target.value })}
                      aria-label={`Receipt date for ${receipt.originalFileName}`}
                      disabled={disabled || markedForRemoval}
                      autoComplete="off"
                    />
                    <Input
                      id={`existing-receipt-reference-${receipt.id}`}
                      name={`existingReceiptReference${receipt.id}`}
                      value={existingDraft.receiptReference || ""}
                      onChange={(event) =>
                        onExistingDraftChange?.(receipt.id, { receiptReference: event.target.value })}
                      placeholder="Receipt Reference"
                      aria-label={`Receipt reference for ${receipt.originalFileName}`}
                      disabled={disabled || markedForRemoval}
                      autoComplete="off"
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onViewExisting ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onViewExisting(receipt)}
                    disabled={disabled}
                  >
                    View
                  </Button>
                ) : null}
                {onToggleRemoveExisting ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={markedForRemoval ? "secondary" : "outline"}
                    onClick={() => onToggleRemoveExisting(receipt.id)}
                    disabled={disabled}
                  >
                    {markedForRemoval ? "Undo Remove" : "Remove"}
                  </Button>
                ) : null}
              </div>
              {markedForRemoval ? (
                <p className="w-full text-xs text-destructive/90">
                  Ditanda untuk buang selepas Save. Anda masih boleh View, atau klik Undo Remove untuk kekalkan.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
