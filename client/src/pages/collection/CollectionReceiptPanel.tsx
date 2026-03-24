import type { ChangeEvent, MutableRefObject } from "react";
import { FileImage, FileText, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CollectionRecordReceipt } from "@/lib/api";
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
  removedReceiptIds?: string[];
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePending: (index: number) => void;
  onClearPending?: () => void;
  onViewExisting?: (receipt: CollectionRecordReceipt) => void;
  onToggleRemoveExisting?: (receiptId: string) => void;
  uploadLabel?: string;
  helperText?: string;
}

export function CollectionReceiptPanel({
  pendingFiles,
  inputRef,
  disabled = false,
  accept = ".jpg,.jpeg,.png,.webp,.pdf",
  existingReceipts = [],
  removedReceiptIds = [],
  onFileChange,
  onRemovePending,
  onClearPending,
  onViewExisting,
  onToggleRemoveExisting,
  uploadLabel = "Upload Receipt",
  helperText = "Upload one receipt at a time. JPG, PNG, and PDF up to 5MB.",
}: CollectionReceiptPanelProps) {
  const draftPreviews = useCollectionReceiptDraftPreviews(pendingFiles);
  const removedSet = new Set(removedReceiptIds);

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onFileChange}
        disabled={disabled}
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

      <p className="text-xs text-muted-foreground">{helperText}</p>

      {existingReceipts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Existing Receipts
          </p>
          <div className="space-y-2">
            {existingReceipts.map((receipt) => {
              const markedForRemoval = removedSet.has(receipt.id);
              return (
                <div
                  key={receipt.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                    markedForRemoval ? "border-destructive/40 bg-destructive/5" : "border-border/60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{receipt.originalFileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {receipt.originalMimeType} | {formatCollectionReceiptFileSize(receipt.fileSize)}
                    </p>
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
                    <p className="truncate text-sm font-medium">{preview.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {preview.file.type || "application/octet-stream"} |{" "}
                      {formatCollectionReceiptFileSize(preview.file.size)}
                    </p>
                  </div>
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
