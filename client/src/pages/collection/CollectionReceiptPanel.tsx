import { useId, type ChangeEvent, type MutableRefObject } from "react";
import { AlertTriangle, FileImage, FileText, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollectionRecordReceipt } from "@/lib/api";
import { buildCollectionReceiptPanelSummary } from "@/pages/collection/collection-receipt-panel-utils";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import {
  formatCollectionReceiptFileSize,
  useCollectionReceiptDraftPreviews,
} from "@/pages/collection/useCollectionReceiptDraftPreviews";

interface CollectionReceiptPanelProps {
  pendingFiles: File[];
  inputRef: MutableRefObject<HTMLInputElement | null>;
  disabled?: boolean;
  accept?: string;
  existingReceipts?: CollectionRecordReceipt[];
  existingReceiptDrafts?: CollectionReceiptDraftInput[];
  removedReceiptIds?: string[];
  pendingReceiptDrafts?: CollectionReceiptDraftInput[];
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

function resolveExtractionStatusBadge(statusRaw: CollectionReceiptDraftInput["extractionStatus"]) {
  const status = String(statusRaw || "unprocessed").trim().toLowerCase();
  if (status === "suggested") {
    return {
      label: "OCR Suggested",
      variant: "secondary" as const,
    };
  }
  if (status === "ambiguous") {
    return {
      label: "Needs Review",
      variant: "outline" as const,
    };
  }
  if (status === "error") {
    return {
      label: "Analysis Error",
      variant: "destructive" as const,
    };
  }
  if (status === "unavailable") {
    return {
      label: "No Amount Found",
      variant: "outline" as const,
    };
  }
  return {
    label: "Analysing",
    variant: "outline" as const,
  };
}

function renderReceiptAssistiveState(draft: CollectionReceiptDraftInput | undefined) {
  if (!draft) {
    return null;
  }

  const extractionBadge = resolveExtractionStatusBadge(draft.extractionStatus);
  const duplicateCount = Number(draft.duplicateSummary?.matchCount || 0);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={extractionBadge.variant}>{extractionBadge.label}</Badge>
        {duplicateCount > 0 ? (
          <Badge variant="outline" className="border-amber-500/50 text-amber-700">
            Possible Duplicate
          </Badge>
        ) : null}
      </div>
      {draft.extractedAmount ? (
        <p className="text-xs text-muted-foreground">
          OCR/PDF suggestion: RM {draft.extractedAmount}
          {typeof draft.extractionConfidence === "number"
            ? ` (${Math.round(draft.extractionConfidence * 100)}% confidence)`
            : ""}
        </p>
      ) : null}
      {draft.extractionMessage ? (
        <p className="text-xs text-muted-foreground">{draft.extractionMessage}</p>
      ) : null}
      {duplicateCount > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 px-2 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Fail ini sepadan dengan {duplicateCount} resit lain yang pernah dimuat naik.
            Semak sebelum simpan.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function CollectionReceiptPanel({
  pendingFiles,
  inputRef,
  disabled = false,
  accept = ".jpg,.jpeg,.png,.webp,.pdf",
  existingReceipts = [],
  existingReceiptDrafts = [],
  removedReceiptIds = [],
  pendingReceiptDrafts = [],
  onFileChange,
  onRemovePending,
  onClearPending,
  onViewExisting,
  onToggleRemoveExisting,
  onExistingDraftChange,
  onPendingDraftChange,
  uploadLabel = "Upload Receipt",
  helperText = "Upload one receipt at a time. JPG, PNG, and PDF up to 5MB.",
}: CollectionReceiptPanelProps) {
  const inputId = useId();
  const helperTextId = `${inputId}-help`;
  const draftPreviews = useCollectionReceiptDraftPreviews(pendingFiles);
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

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="sr-only">
        {uploadLabel}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onFileChange}
        disabled={disabled}
        aria-describedby={helperText ? helperTextId : undefined}
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

      {existingReceipts.length > 0 ? (
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
                    {renderReceiptAssistiveState(existingDraft)}
                    {existingDraft ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <Input
                          value={existingDraft.receiptAmount || ""}
                          onChange={(event) =>
                            onExistingDraftChange?.(receipt.id, { receiptAmount: event.target.value })}
                          placeholder="Receipt Amount (RM)"
                          disabled={disabled || markedForRemoval}
                          inputMode="decimal"
                        />
                        <Input
                          type="date"
                          value={existingDraft.receiptDate || ""}
                          onChange={(event) =>
                            onExistingDraftChange?.(receipt.id, { receiptDate: event.target.value })}
                          disabled={disabled || markedForRemoval}
                        />
                        <Input
                          value={existingDraft.receiptReference || ""}
                          onChange={(event) =>
                            onExistingDraftChange?.(receipt.id, { receiptReference: event.target.value })}
                          placeholder="Receipt Reference"
                          disabled={disabled || markedForRemoval}
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
                        disabled={disabled || markedForRemoval}
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
                        {markedForRemoval ? "Will be removed" : "Remove"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

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
            {draftPreviews.map((preview, index) => (
              <div
                key={preview.key}
                className="overflow-hidden rounded-md border border-border/60 bg-background/60"
              >
                <div className="flex h-36 items-center justify-center bg-muted/20">
                  {preview.kind === "image" ? (
                    preview.url ? (
                      <img
                        src={preview.url}
                        alt={preview.file.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
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
                      {summary.willReplace ? (
                        <Badge variant="secondary">Replacement</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {preview.file.type || "application/octet-stream"} |{" "}
                      {formatCollectionReceiptFileSize(preview.file.size)}
                    </p>
                  </div>
                  {renderReceiptAssistiveState(pendingReceiptDrafts[index])}
                  {pendingReceiptDrafts[index] ? (
                    <div className="grid gap-2">
                      <Input
                        value={pendingReceiptDrafts[index]?.receiptAmount || ""}
                        onChange={(event) =>
                          onPendingDraftChange?.(index, { receiptAmount: event.target.value })}
                        placeholder="Receipt Amount (RM)"
                        disabled={disabled}
                        inputMode="decimal"
                      />
                      <div className="grid gap-2 md:grid-cols-2">
                        <Input
                          type="date"
                          value={pendingReceiptDrafts[index]?.receiptDate || ""}
                          onChange={(event) =>
                            onPendingDraftChange?.(index, { receiptDate: event.target.value })}
                          disabled={disabled}
                        />
                        <Input
                          value={pendingReceiptDrafts[index]?.receiptReference || ""}
                          onChange={(event) =>
                            onPendingDraftChange?.(index, { receiptReference: event.target.value })}
                          placeholder="Receipt Reference"
                          disabled={disabled}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
