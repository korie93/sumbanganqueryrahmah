import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveSafePreviewSourceUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";
import type { CollectionRecord, CollectionRecordReceipt } from "@/lib/api";
import { ReceiptPreviewContent } from "@/pages/collection-records/ReceiptPreviewContent";
import { ReceiptPreviewRecordDetails } from "@/pages/collection-records/ReceiptPreviewRecordDetails";
import { ReceiptPreviewSelector } from "@/pages/collection-records/ReceiptPreviewSelector";
import { ReceiptPreviewToolbar } from "@/pages/collection-records/ReceiptPreviewToolbar";
import {
  getReceiptPreviewZoomValue,
  resolveSelectedReceipt,
} from "@/pages/collection-records/receipt-preview-dialog-utils";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";
import { shouldRenderInlineReceiptPdfPreview } from "@/pages/collection-records/utils";
import "./receipt-preview-dialog.css";

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
  const isMobile = useIsMobile();
  const [zoom, setZoom] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const safeSource = resolveSafePreviewSourceUrl(source);
  const hasUnsafeSource = Boolean(String(source || "").trim()) && !safeSource;
  const selectedReceipt = resolveSelectedReceipt(receipts, selectedReceiptId);
  const canRenderInlinePdfPreview = shouldRenderInlineReceiptPdfPreview({ kind, isMobile });
  const showPdfFallback = Boolean(safeSource) && kind === "pdf" && !canRenderInlinePdfPreview;
  const canZoom = Boolean(safeSource) && (kind === "image" || canRenderInlinePdfPreview);
  const zoomValue = getReceiptPreviewZoomValue(zoom);

  useEffect(() => {
    if (open) {
      setZoom(1);
    }
  }, [fileName, open, selectedReceiptId, source]);

  useEffect(() => {
    if (!open) {
      setShowDetails(false);
    }
  }, [open, selectedReceiptId, source]);

  if (!open && !record && !loading && !source && !error) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "receipt-preview-dialog",
          isMobile
            ? "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0"
            : "flex h-[90vh] w-[96vw] max-w-6xl flex-col",
        )}
      >
        <DialogHeader className={isMobile ? "border-b border-border/60 px-4 py-4 pr-12 text-left" : ""}>
          <DialogTitle>Receipt Preview</DialogTitle>
          <DialogDescription className="break-words text-xs leading-5 sm:text-sm">
            {fileName || selectedReceipt?.originalFileName || "Preview fail resit yang dimuat naik."}
          </DialogDescription>
        </DialogHeader>

        <ReceiptPreviewSelector
          receipts={receipts}
          selectedReceipt={selectedReceipt}
          loading={loading}
          isMobile={isMobile}
          onSelectReceipt={onSelectReceipt}
        />

        <ReceiptPreviewToolbar
          selectedReceipt={selectedReceipt}
          showDetails={showDetails}
          setShowDetails={setShowDetails}
          showPdfFallback={showPdfFallback}
          safeSource={safeSource}
          canZoom={canZoom}
          zoom={zoom}
          setZoom={setZoom}
          isMobile={isMobile}
        />

        <ReceiptPreviewRecordDetails
          record={record}
          selectedReceipt={selectedReceipt}
          showDetails={showDetails}
          isMobile={isMobile}
        />

        <ReceiptPreviewContent
          loading={loading}
          error={error}
          safeSource={safeSource}
          hasUnsafeSource={hasUnsafeSource}
          showPdfFallback={showPdfFallback}
          kind={kind}
          isMobile={isMobile}
          zoomValue={zoomValue}
          fileName={fileName}
          selectedReceipt={selectedReceipt}
          downloading={downloading}
          onDownload={onDownload}
        />

        <DialogFooter
          className={cn(
            "gap-2 border-t border-border/60 bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85",
            isMobile
              ? "sticky bottom-0 z-[var(--z-sticky-content)] flex-col-reverse px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
              : "flex-row items-center justify-end px-0 py-0",
          )}
          data-floating-ai-avoid="true"
        >
          <Button
            type="button"
            variant="outline"
            onClick={onDownload}
            disabled={!record || downloading}
            className={isMobile ? "w-full" : ""}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Downloading..." : "Download Original"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} className={isMobile ? "w-full" : ""}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
