import { useId, type ChangeEvent, type MutableRefObject } from "react";
import { CloudUpload, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollectionRecordReceipt } from "@/lib/api";
import { CollectionReceiptDuplicateWarning } from "@/pages/collection/CollectionReceiptDuplicateWarning";
import { CollectionReceiptDraftCard } from "@/pages/collection/CollectionReceiptDraftCard";
import {
  resolveCollectionReceiptPendingStatusCopy,
  type CollectionReceiptPendingStatus,
} from "@/pages/collection/collection-receipt-pending-status";
import {
  buildCollectionReceiptPanelSummary,
  formatCollectionReceiptFileName,
} from "@/pages/collection/collection-receipt-panel-utils";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import {
  formatCollectionReceiptFileSize,
  useCollectionReceiptDraftPreviews,
} from "@/pages/collection/useCollectionReceiptDraftPreviews";

interface CollectionReceiptPanelProps {
  presentation?: "default" | "workspace";
  pendingFiles: File[];
  inputRef: MutableRefObject<HTMLInputElement | null>;
  disabled?: boolean;
  accept?: string;
  existingReceipts?: CollectionRecordReceipt[];
  existingReceiptDrafts?: CollectionReceiptDraftInput[];
  removedReceiptIds?: string[];
  pendingReceiptDrafts?: CollectionReceiptDraftInput[];
  pendingStatus?: CollectionReceiptPendingStatus;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePending: (index: number) => void;
  onClearPending?: () => void;
  onViewExisting?: (receipt: CollectionRecordReceipt) => void;
  onToggleRemoveExisting?: (receiptId: string) => void;
  onExistingDraftChange?: (receiptId: string, patch: Partial<CollectionReceiptDraftInput>) => void;
  onPendingDraftChange?: (index: number, patch: Partial<CollectionReceiptDraftInput>) => void;
  uploadLabel?: string;
  helperText?: string;
}

export function CollectionReceiptPanel({
  presentation = "default",
  pendingFiles,
  inputRef,
  disabled = false,
  accept = ".jpg,.jpeg,.png,.webp,.pdf",
  existingReceipts = [],
  existingReceiptDrafts = [],
  removedReceiptIds = [],
  pendingReceiptDrafts = [],
  pendingStatus = "pending",
  onFileChange,
  onRemovePending,
  onClearPending,
  onViewExisting,
  onToggleRemoveExisting,
  onExistingDraftChange,
  onPendingDraftChange,
  uploadLabel = "Upload Receipt",
  helperText = "One receipt at a time. JPG, JPEG, PNG, WEBP or PDF, up to 5MB each.",
}: CollectionReceiptPanelProps) {
  const isWorkspace = presentation === "workspace";
  const inputId = useId();
  const helperTextId = `${inputId}-help`;
  const draftPreviews = useCollectionReceiptDraftPreviews(pendingFiles);
  const pendingStatusCopy = resolveCollectionReceiptPendingStatusCopy(pendingStatus);
  const removedSet = new Set(removedReceiptIds);
  const existingDraftMap = new Map(
    existingReceiptDrafts
      .filter((draft) => Boolean(String(draft.receiptId || "").trim()))
      .map((draft) => [String(draft.receiptId), draft]),
  );
  const summary = buildCollectionReceiptPanelSummary({
    existingCount: existingReceipts.length,
    removedExistingCount: removedReceiptIds.length,
    pendingCount: pendingFiles.length,
  });
  const uploadButton = (
    <Button
      type="button"
      variant={isWorkspace ? "default" : "outline"}
      onClick={() => inputRef.current?.click()}
      disabled={disabled}
      {...(helperText ? { "aria-describedby": helperTextId } : {})}
    >
      {uploadLabel}
    </Button>
  );
  const clearPendingButton = onClearPending ? (
    <Button
      type="button"
      variant="ghost"
      onClick={onClearPending}
      disabled={disabled || pendingFiles.length === 0}
    >
      <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
      Clear Pending
    </Button>
  ) : null;

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="sr-only">
        {uploadLabel}
      </label>
      <input
        id={inputId}
        name="collectionReceiptUpload"
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onFileChange}
        disabled={disabled}
        {...(helperText ? { "aria-describedby": helperTextId } : {})}
      />

      {isWorkspace ? (
        <>
          {clearPendingButton ? (
            <div className="flex flex-wrap justify-end gap-2">{clearPendingButton}</div>
          ) : null}
          <div className={`save-collection-receipt-upload-zone flex min-h-44 min-w-0 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-background/60 px-4 py-5 text-center sm:py-6${pendingFiles.length === 0 ? " save-collection-receipt-upload-zone--empty" : ""}`}>
            <div className="save-collection-receipt-upload-entry flex flex-col items-center gap-3">
              <div className="save-collection-receipt-upload-icon flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/30 text-primary">
                <CloudUpload className="h-5 w-5" aria-hidden="true" />
              </div>
              {uploadButton}
            </div>
            <p id={helperTextId} className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              {helperText}
            </p>
            {pendingFiles.length === 0 ? (
              <p className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                No pending receipt.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {uploadButton}
            {clearPendingButton}
          </div>
          <p id={helperTextId} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        </>
      )}
      <CollectionReceiptDuplicateWarning pendingFiles={pendingFiles} />
      {summary.existingCount > 0 || summary.pendingCount > 0 ? (
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {summary.existingCount > 0 ? (
              <Badge variant="secondary">Existing {summary.existingCount}</Badge>
            ) : null}
            {summary.removedExistingCount > 0 ? (
              <Badge variant="destructive">Will Remove {summary.removedExistingCount}</Badge>
            ) : null}
            {summary.pendingCount > 0 ? (
              <Badge variant={pendingStatusCopy.badgeVariant}>
                {pendingStatusCopy.badgeLabel} {summary.pendingCount}
              </Badge>
            ) : null}
            {summary.willReplace ? (
              <Badge variant="secondary">Replacement Pending</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {pendingStatus === "pending" ? summary.message : pendingStatusCopy.helperText}
          </p>
        </div>
      ) : null}

      {existingReceipts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Existing Receipts
          </p>
          <div className="space-y-2">
            {existingReceipts.map((receipt) => {
              const markedForRemoval = removedSet.has(receipt.id);
              const existingDraft = existingDraftMap.get(receipt.id);
              const existingReceiptLabel = formatCollectionReceiptFileName(
                receipt.originalFileName,
              );
              return (
                <div
                  key={receipt.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                    markedForRemoval ? "border-destructive/40 bg-destructive/5" : "border-border/60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className="truncate text-sm font-medium"
                        title={existingReceiptLabel}
                        aria-label={existingReceiptLabel}
                      >
                        {existingReceiptLabel}
                      </p>
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
                          aria-label={`Existing receipt amount for ${existingReceiptLabel}`}
                          value={existingDraft.receiptAmount || ""}
                          onChange={(event) =>
                            onExistingDraftChange?.(receipt.id, { receiptAmount: event.target.value })}
                          placeholder="Receipt Amount (RM)"
                          disabled={disabled || markedForRemoval}
                          inputMode="decimal"
                          autoComplete="off"
                        />
                        <Input
                          id={`existing-receipt-date-${receipt.id}`}
                          name={`existingReceiptDate${receipt.id}`}
                          type="date"
                          aria-label={`Existing receipt date for ${existingReceiptLabel}`}
                          value={existingDraft.receiptDate || ""}
                          onChange={(event) =>
                            onExistingDraftChange?.(receipt.id, { receiptDate: event.target.value })}
                          disabled={disabled || markedForRemoval}
                          autoComplete="off"
                        />
                        <Input
                          id={`existing-receipt-reference-${receipt.id}`}
                          name={`existingReceiptReference${receipt.id}`}
                          aria-label={`Existing receipt reference for ${existingReceiptLabel}`}
                          value={existingDraft.receiptReference || ""}
                          onChange={(event) =>
                            onExistingDraftChange?.(receipt.id, { receiptReference: event.target.value })}
                          placeholder="Receipt Reference"
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
      ) : null}

      <div className="space-y-3">
        {draftPreviews.length > 0 ? (
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pending Receipts
              </p>
              <p className="text-xs text-muted-foreground">
                Semak jumlah, tarikh dan reference setiap receipt.
              </p>
            </div>
            <Badge variant="secondary">
              {draftPreviews.length} pending
            </Badge>
          </div>
        ) : null}
        {draftPreviews.length === 0 ? isWorkspace ? null : (
          <div className="rounded-md border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
            No pending receipt.
          </div>
        ) : (
          <div className="space-y-3">
            {draftPreviews.map((preview, index) => {
              return (
                <CollectionReceiptDraftCard
                  key={preview.key}
                  preview={preview}
                  index={index}
                  totalCount={draftPreviews.length}
                  draft={pendingReceiptDrafts[index]}
                  disabled={disabled}
                  pendingStatus={pendingStatus}
                  pendingStatusCopy={pendingStatusCopy}
                  willReplace={summary.willReplace}
                  onDraftChange={onPendingDraftChange}
                  onRemove={onRemovePending}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
