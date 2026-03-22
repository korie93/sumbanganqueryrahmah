import { useEffect, useState } from "react";
import { Download, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CollectionRecord, CollectionRecordReceipt } from "@/lib/api";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";

export interface ReceiptPreviewDialogProps {
  open: boolean;
  record: CollectionRecord | null;
  receipts: CollectionRecordReceipt[];
  selectedReceiptId: string | null;
  loading: boolean;
  downloading: boolean;
  source: string;
  fileName: string;
  error: string;
  kind: ReceiptPreviewKind;
  onOpenChange: (open: boolean) => void;
  onSelectReceipt: (receiptId: string) => void;
  onDownload: () => void;
  onClose: () => void;
}

export function ReceiptPreviewDialog({
  open,
  record,
  receipts,
  selectedReceiptId,
  loading,
  downloading,
  source,
  fileName,
  error,
  kind,
  onOpenChange,
  onSelectReceipt,
  onDownload,
  onClose,
}: ReceiptPreviewDialogProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (open) {
      setZoom(1);
    }
  }, [fileName, open, selectedReceiptId, source]);

  const selectedReceipt =
    receipts.find((receipt) => receipt.id === selectedReceiptId) || receipts[0] || null;
  const canZoom = Boolean(source) && (kind === "image" || kind === "pdf");

  if (!open && !record && !loading && !source && !error) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[96vw] max-w-6xl flex-col">
        <DialogHeader>
          <DialogTitle>Receipt Preview</DialogTitle>
          <DialogDescription>
            {fileName || selectedReceipt?.originalFileName || record?.receiptFile || "Preview fail resit yang dimuat naik."}
          </DialogDescription>
        </DialogHeader>

        {receipts.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/40 p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Receipts
            </span>
            {receipts.map((receipt, index) => (
              <Button
                key={receipt.id}
                type="button"
                size="sm"
                variant={selectedReceipt?.id === receipt.id ? "default" : "outline"}
                onClick={() => onSelectReceipt(receipt.id)}
                disabled={loading}
              >
                #{index + 1}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {selectedReceipt ? (
              <>
                <Badge variant="secondary">{selectedReceipt.originalMimeType}</Badge>
                <span>{selectedReceipt.originalFileName}</span>
              </>
            ) : null}
          </div>
          {canZoom ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setZoom((previous) => Math.max(0.5, Number((previous - 0.1).toFixed(2))))}
                disabled={zoom <= 0.5}
              >
                <ZoomOut className="mr-2 h-4 w-4" />
                Zoom Out
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setZoom(1)}
                disabled={zoom === 1}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setZoom((previous) => Math.min(3, Number((previous + 0.1).toFixed(2))))}
                disabled={zoom >= 3}
              >
                <ZoomIn className="mr-2 h-4 w-4" />
                Zoom In
              </Button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 rounded-md border border-border/60 bg-background/40 p-3">
          {loading ? (
            <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              Loading preview...
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : !source ? (
            <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {kind === "pdf"
                ? "PDF preview is unavailable. You can still download the file."
                : "Preview not available for this file type."}
            </div>
          ) : kind === "pdf" ? (
            <div className="h-full overflow-auto">
              <div
                className="mx-auto"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                  width: `${Math.max(40, Math.round(100 / zoom))}%`,
                  height: "72vh",
                }}
              >
                <iframe
                  src={source}
                  title="Receipt PDF Preview"
                  className="h-full w-full rounded-sm bg-white"
                />
              </div>
            </div>
          ) : kind === "image" ? (
            <div className="flex h-full items-start justify-center overflow-auto">
              <img
                src={source}
                alt={fileName || "Receipt preview"}
                className="max-w-none rounded-sm object-contain"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                }}
              />
            </div>
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              Preview not available for this file type.
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onDownload}
            disabled={!record || downloading}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Downloading..." : "Download Original"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
