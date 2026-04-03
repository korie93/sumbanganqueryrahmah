import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveSafePreviewSourceUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";
import type { CollectionRecord, CollectionRecordReceipt } from "@/lib/api";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { formatAmountRM } from "@/pages/collection/utils";
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

function clampReceiptPreviewZoom(zoom: number): number {
  return Math.min(3, Math.max(0.5, Number(zoom.toFixed(2))));
}

function getReceiptPreviewZoomClass(zoom: number): string {
  const clamped = clampReceiptPreviewZoom(zoom);
  const zoomStep = Math.round(clamped * 10);
  return `receipt-preview-zoom-${zoomStep}`;
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

  const selectedReceipt =
    receipts.find((receipt) => receipt.id === selectedReceiptId) || receipts[0] || null;
  const canRenderInlinePdfPreview = shouldRenderInlineReceiptPdfPreview({
    kind,
    isMobile,
  });
  const showPdfFallback = Boolean(safeSource) && kind === "pdf" && !canRenderInlinePdfPreview;
  const canZoom = Boolean(safeSource) && (kind === "image" || canRenderInlinePdfPreview);
  const zoomClassName = getReceiptPreviewZoomClass(zoom);

  if (!open && !record && !loading && !source && !error) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0"
            : "flex h-[90vh] w-[96vw] max-w-6xl flex-col"
        }
      >
        <DialogHeader className={isMobile ? "border-b border-border/60 px-4 py-4 pr-12 text-left" : ""}>
          <DialogTitle>Receipt Preview</DialogTitle>
          <DialogDescription className="break-words text-xs leading-5 sm:text-sm">
            {fileName || selectedReceipt?.originalFileName || "Preview fail resit yang dimuat naik."}
          </DialogDescription>
        </DialogHeader>

        {receipts.length > 1 ? (
          <div className={cn(
            "rounded-md border border-border/60 bg-background/40 p-3",
            isMobile ? "mx-3 mt-3 overflow-x-auto" : "mt-3 flex flex-wrap items-center gap-2",
          )}>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Receipts
            </span>
            <div className={cn("gap-2", isMobile ? "mt-2 flex w-max min-w-full" : "flex flex-wrap items-center")}>
              {receipts.map((receipt, index) => (
                <Button
                  key={receipt.id}
                  type="button"
                  size="sm"
                  variant={selectedReceipt?.id === receipt.id ? "default" : "outline"}
                  onClick={() => onSelectReceipt(receipt.id)}
                  disabled={loading}
                  className={isMobile ? "shrink-0" : ""}
                >
                  #{index + 1}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "rounded-md border border-border/60 bg-background/40",
            isMobile ? "mx-3 mt-3 space-y-3 px-3 py-3" : "mt-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2",
          )}
          data-floating-ai-avoid="true"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {showDetails && selectedReceipt ? (
              <>
                <Badge variant="secondary">{selectedReceipt.originalMimeType}</Badge>
                <span className="break-all">{selectedReceipt.originalFileName}</span>
              </>
            ) : (
              <span>Receipt info hidden. Click Show more to view details.</span>
            )}
          </div>
          <div className={cn(isMobile ? "grid grid-cols-2 gap-2" : "flex items-center gap-2")}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowDetails((previous) => !previous)}
              aria-expanded={showDetails}
              className={isMobile ? "col-span-2 w-full" : ""}
            >
              {showDetails ? "Show less" : "Show more"}
            </Button>
            {showPdfFallback ? (
              <Button
                size="sm"
                variant="outline"
                asChild
                className={isMobile ? "col-span-2 w-full" : ""}
              >
                <a href={safeSource || undefined} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open PDF
                </a>
              </Button>
            ) : null}
            {canZoom ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setZoom((previous) => Math.max(0.5, Number((previous - 0.1).toFixed(2))))}
                  disabled={zoom <= 0.5}
                  className={isMobile ? "w-full" : ""}
                >
                  <ZoomOut className="mr-2 h-4 w-4" />
                  {isMobile ? "Zoom -" : "Zoom Out"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setZoom(1)}
                  disabled={zoom === 1}
                  className={isMobile ? "w-full" : ""}
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
                  className={isMobile ? "col-span-2 w-full" : ""}
                >
                  <ZoomIn className="mr-2 h-4 w-4" />
                  {isMobile ? "Zoom +" : "Zoom In"}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {record && showDetails ? (
          <div className={cn("rounded-md border border-border/60 bg-background/40 px-3 py-3", isMobile ? "mx-3 mt-3" : "mt-3")}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="break-words">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Customer</p>
                <p className="text-sm font-medium">{record.customerName}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment Date</p>
                <p className="text-sm font-medium">{formatIsoDateToDDMMYYYY(record.paymentDate)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Paid</p>
                <p className="text-sm font-medium">{formatAmountRM(record.amount)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipt Total</p>
                <p className="text-sm font-medium">{formatAmountRM(record.receiptTotalAmount)}</p>
              </div>
              {selectedReceipt ? (
                <>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipt Amount</p>
                    <p className="text-sm font-medium">
                      {selectedReceipt.receiptAmount ? formatAmountRM(selectedReceipt.receiptAmount) : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipt Date</p>
                    <p className="text-sm font-medium">
                      {selectedReceipt.receiptDate ? formatIsoDateToDDMMYYYY(selectedReceipt.receiptDate) : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reference</p>
                    <p className="break-words text-sm font-medium">{selectedReceipt.receiptReference || "-"}</p>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={cn("min-h-0 flex-1 rounded-md border border-border/60 bg-background/40 p-3", isMobile ? "mx-3 my-3" : "mt-3")}>
          {loading ? (
            <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              Loading preview...
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : !safeSource ? (
            <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {hasUnsafeSource
                ? "Preview URL was blocked for safety."
                : kind === "pdf"
                  ? "PDF preview is unavailable. You can still download the file."
                  : "Preview not available for this file type."}
            </div>
          ) : showPdfFallback ? (
            <div className="flex h-full min-h-[280px] items-center justify-center">
              <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-background px-4 py-5 text-center shadow-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-semibold text-foreground">PDF preview is limited on this device</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Open the original PDF in your browser viewer or download it to inspect the receipt safely.
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {fileName || selectedReceipt?.originalFileName || "receipt.pdf"}
                  </p>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <Button className="w-full" asChild>
                    <a href={safeSource} target="_blank" rel="noreferrer noopener">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open PDF in Browser
                    </a>
                  </Button>
                  <Button type="button" variant="outline" onClick={onDownload} disabled={downloading} className="w-full">
                    <Download className="mr-2 h-4 w-4" />
                    {downloading ? "Downloading..." : "Download Original"}
                  </Button>
                </div>
              </div>
            </div>
          ) : kind === "pdf" ? (
            <div className="h-full overflow-auto">
              <div
                className={cn("mx-auto w-full", isMobile ? "h-full" : "h-[72vh]", zoomClassName)}
              >
                <iframe
                  src={safeSource}
                  title="Receipt PDF Preview"
                  className="h-full w-full rounded-sm bg-white"
                  loading="lazy"
                />
              </div>
            </div>
          ) : kind === "image" ? (
            <div className="flex h-full items-center justify-center overflow-auto">
              <img
                src={safeSource}
                alt={fileName || "Receipt preview"}
                className={cn(
                  "block rounded-sm object-contain",
                  isMobile ? "max-w-full" : "max-w-none",
                  zoomClassName,
                )}
              />
            </div>
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              Preview not available for this file type.
            </div>
          )}
        </div>

        <DialogFooter
          className={cn(
            "gap-2 border-t border-border/60 bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85",
            isMobile
              ? "sticky bottom-0 z-10 flex-col-reverse px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
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
