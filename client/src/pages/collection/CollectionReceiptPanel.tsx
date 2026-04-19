import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type MutableRefObject,
} from "react";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CollectionRecordReceipt } from "@/lib/api";
import { CollectionReceiptExistingList } from "@/pages/collection/CollectionReceiptExistingList";
import { CollectionReceiptPendingGrid } from "@/pages/collection/CollectionReceiptPendingGrid";
import { buildCollectionReceiptPanelSummary } from "@/pages/collection/collection-receipt-panel-utils";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import {
  useCollectionReceiptDraftPreviews,
} from "@/pages/collection/useCollectionReceiptDraftPreviews";

export interface CollectionReceiptPanelPendingState {
  pendingFiles: File[];
  inputRef: MutableRefObject<HTMLInputElement | null>;
  disabled?: boolean;
  accept?: string;
  pendingReceiptDrafts?: CollectionReceiptDraftInput[];
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePending: (index: number) => void;
  onClearPending?: () => void;
  onPendingDraftChange?: (index: number, patch: Partial<CollectionReceiptDraftInput>) => void;
  uploadLabel?: string;
  helperText?: string;
}

export interface CollectionReceiptPanelExistingState {
  existingReceipts?: CollectionRecordReceipt[];
  existingReceiptDrafts?: CollectionReceiptDraftInput[];
  removedReceiptIds?: string[];
  onViewExisting?: (receipt: CollectionRecordReceipt) => void;
  onToggleRemoveExisting?: (receiptId: string) => void;
  onExistingDraftChange?: (receiptId: string, patch: Partial<CollectionReceiptDraftInput>) => void;
}

interface CollectionReceiptPanelProps {
  pending: CollectionReceiptPanelPendingState;
  existing?: CollectionReceiptPanelExistingState;
}

export function CollectionReceiptPanel({
  pending,
  existing,
}: CollectionReceiptPanelProps) {
  const {
    pendingFiles,
    inputRef,
    disabled = false,
    accept = ".jpg,.jpeg,.png,.webp,.pdf",
    pendingReceiptDrafts = [],
    onFileChange,
    onRemovePending,
    onClearPending,
    onPendingDraftChange,
    uploadLabel = "Upload Receipt",
    helperText = "Upload one receipt at a time. JPG, PNG, and PDF up to 5MB.",
  } = pending;
  const {
    existingReceipts = [],
    existingReceiptDrafts = [],
    removedReceiptIds = [],
    onViewExisting,
    onToggleRemoveExisting,
    onExistingDraftChange,
  } = existing ?? {};
  const inputId = useId();
  const helperTextId = `${inputId}-help`;
  const draftPreviews = useCollectionReceiptDraftPreviews(pendingFiles);
  const [failedImagePreviewKeys, setFailedImagePreviewKeys] = useState<Set<string>>(() => new Set());
  const summary = buildCollectionReceiptPanelSummary({
    existingCount: existingReceipts.length,
    removedExistingCount: removedReceiptIds.length,
    pendingCount: pendingFiles.length,
  });

  useEffect(() => {
    const previewKeys = new Set(draftPreviews.map((preview) => preview.key));
    setFailedImagePreviewKeys((previous) => {
      const next = new Set(Array.from(previous).filter((key) => previewKeys.has(key)));
      if (
        next.size === previous.size
        && Array.from(next).every((key) => previous.has(key))
      ) {
        return previous;
      }
      return next;
    });
  }, [draftPreviews]);

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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {uploadLabel}
        </Button>
        {onClearPending ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onClearPending}
            disabled={disabled || pendingFiles.length === 0}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear Pending
          </Button>
        ) : null}
      </div>

      <p id={helperTextId} className="text-xs text-muted-foreground">
        {helperText}
      </p>
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {summary.existingCount > 0 ? (
            <Badge variant="secondary">Existing {summary.existingCount}</Badge>
          ) : null}
          {summary.removedExistingCount > 0 ? (
            <Badge variant="destructive">Will Remove {summary.removedExistingCount}</Badge>
          ) : null}
          {summary.pendingCount > 0 ? (
            <Badge variant="outline">Pending Upload {summary.pendingCount}</Badge>
          ) : null}
          {summary.willReplace ? (
            <Badge variant="secondary">Replacement Pending</Badge>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{summary.message}</p>
      </div>

      <CollectionReceiptExistingList
        disabled={disabled}
        existingReceiptDrafts={existingReceiptDrafts}
        existingReceipts={existingReceipts}
        removedReceiptIds={removedReceiptIds}
        {...(onExistingDraftChange ? { onExistingDraftChange } : {})}
        {...(onToggleRemoveExisting ? { onToggleRemoveExisting } : {})}
        {...(onViewExisting ? { onViewExisting } : {})}
      />
      <CollectionReceiptPendingGrid
        disabled={disabled}
        draftPreviews={draftPreviews}
        failedImagePreviewKeys={failedImagePreviewKeys}
        onMarkImagePreviewFailed={(previewKey) => {
          setFailedImagePreviewKeys((previous) => {
            if (previous.has(previewKey)) {
              return previous;
            }

            const next = new Set(previous);
            next.add(previewKey);
            return next;
          });
        }}
        onRemovePending={onRemovePending}
        pendingReceiptDrafts={pendingReceiptDrafts}
        willReplace={summary.willReplace}
        {...(onPendingDraftChange ? { onPendingDraftChange } : {})}
      />
    </div>
  );
}
