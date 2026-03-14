import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CollectionRecord } from "@/lib/api";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";

interface ReceiptPreviewDialogProps {
  open: boolean;
  record: CollectionRecord | null;
  loading: boolean;
  downloading: boolean;
  source: string;
  fileName: string;
  error: string;
  kind: ReceiptPreviewKind;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
  onClose: () => void;
}

export function ReceiptPreviewDialog({
  open,
  record,
  loading,
  downloading,
  source,
  fileName,
  error,
  kind,
  onOpenChange,
  onDownload,
  onClose,
}: ReceiptPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Receipt Preview</DialogTitle>
          <DialogDescription>
            {fileName || record?.receiptFile || "Preview fail resit yang dimuat naik."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 rounded-md border border-border/60 bg-background/40 overflow-auto p-3">
          {loading ? (
            <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              Loading preview...
            </div>
          ) : error ? (
            <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
              {error}
            </div>
          ) : !source ? (
            <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
              {kind === "pdf"
                ? "PDF preview is unavailable. You can still download the file."
                : "Preview not available for this file type."}
            </div>
          ) : kind === "pdf" ? (
            <iframe
              src={source}
              title="Receipt PDF Preview"
              className="w-full h-full min-h-[65vh] rounded-sm bg-white"
            />
          ) : kind === "image" ? (
            <div className="h-full flex items-center justify-center">
              <img
                src={source}
                alt={fileName || "Receipt preview"}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
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
            <Download className="w-4 h-4 mr-2" />
            {downloading ? "Downloading..." : "Download"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
