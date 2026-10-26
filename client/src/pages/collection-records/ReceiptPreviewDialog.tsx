import { useEffect, useId, useState, type SetStateAction } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mobileFullscreenDialogViewportClassName } from "@/components/ui/dialog-viewport";
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
  normalizeReceiptPreviewRotation,
  resolveSelectedReceipt,
  shouldShowReceiptPreviewZoomControls,
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
  onCloseAutoFocus?: (event: Event) => void;
  onSelectReceipt: (receiptId: string) => void;
  onDownload: () => void;
  onRetry?: () => void;
  onClose: () => void;
  refining?: boolean;
  refinementError?: string;
  onImageZoom?: (zoom: number) => void;
  onRetryRefinement?: () => void;
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
  onCloseAutoFocus,
  onSelectReceipt,
  onDownload,
  onRetry,
  onClose,
  refining = false,
  refinementError = "",
  onImageZoom,
  onRetryRefinement,
}: ReceiptPreviewDialogProps) {
  const isMobile = useIsMobile();
  const detailsId = useId();
  const [zoom, setZoom] = useState(1);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const safeSource = resolveSafePreviewSourceUrl(source);
  const hasUnsafeSource = Boolean(String(source || "").trim()) && !safeSource;
  const selectedReceipt = resolveSelectedReceipt(receipts, selectedReceiptId);
  const canRenderInlinePdfPreview = shouldRenderInlineReceiptPdfPreview({ kind, isMobile });
  const showPdfFallback = Boolean(safeSource) && kind === "pdf" && !canRenderInlinePdfPreview;
  const canZoom = shouldShowReceiptPreviewZoomControls({ kind, safeSource });
  const zoomValue = getReceiptPreviewZoomValue(zoom);

  useEffect(() => {
    if (open) {
      setZoom(1);
      setRotationDegrees(0);
    }
  }, [open, record?.id, selectedReceiptId]);

  const changeZoom = (update: SetStateAction<number>) => {
    const nextZoom = typeof update === "function" ? update(zoom) : update;
    setZoom(nextZoom);
    onImageZoom?.(nextZoom);
  };

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
        onCloseAutoFocus={onCloseAutoFocus}
        className={
          isMobile
            ? `${mobileFullscreenDialogViewportClassName} flex w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0`
            : "flex h-[90vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden"
        }
      >
        <DialogHeader className={isMobile ? "shrink-0 border-b border-border/60 px-4 py-3 pr-12 text-left" : "shrink-0 pr-8"}>
          <DialogTitle>Receipt Preview</DialogTitle>
          <DialogDescription className="truncate text-xs leading-5 sm:text-sm" title={selectedReceipt?.originalFileName || fileName}>
            {selectedReceipt?.originalFileName || fileName || "Preview fail resit yang dimuat naik."}
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
          detailsId={detailsId}
          showDetails={showDetails}
          setShowDetails={setShowDetails}
          canShowDetails={Boolean(record)}
          canZoom={canZoom}
          zoom={zoom}
          setZoom={changeZoom}
          setRotationDegrees={setRotationDegrees}
          isMobile={isMobile}
        />

        {refining ? <p role="status" className={cn("text-xs text-muted-foreground", isMobile ? "mx-3 mt-2" : "mt-2")}>
          Preparing a clearer preview…
        </p> : refinementError ? <div className={cn("flex flex-wrap items-center gap-2 text-xs text-muted-foreground", isMobile ? "mx-3 mt-2" : "mt-2")}>
          <p role="status">{refinementError}</p>
          {onRetryRefinement ? <Button type="button" size="sm" variant="ghost" onClick={onRetryRefinement}>Retry clearer preview</Button> : null}
        </div> : null}

        <ReceiptPreviewRecordDetails
          id={detailsId}
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
          rotationDegrees={normalizeReceiptPreviewRotation(rotationDegrees)}
          fileName={fileName}
          imageIdentity={JSON.stringify([record?.id || "", selectedReceiptId || ""])}
          selectedReceipt={selectedReceipt}
          onRetry={onRetry}
        />

        <DialogFooter
          className={cn(
            "shrink-0 gap-2 border-t border-border/60 bg-background/95 sqr-backdrop-blur supports-[backdrop-filter]:bg-background/85",
            isMobile
              ? "flex-row flex-wrap items-center justify-end px-3 py-3 pb-[calc(var(--safe-area-inset-bottom)+0.75rem)]"
              : "mt-3 flex-row items-center justify-end pt-3",
          )}
          data-floating-ai-avoid="true"
        >
          {kind === "pdf" && safeSource && !loading && !error ? (
            <Button type="button" variant="default" asChild className={isMobile ? "flex-1" : ""}>
              <a href={safeSource} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                Open PDF
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onDownload}
            disabled={!record || downloading}
            aria-busy={downloading}
            className={isMobile ? "flex-1" : ""}
          >
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
            {downloading ? "Downloading..." : "Download Original"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} className={isMobile && kind === "pdf" && safeSource ? "w-full" : ""}>
            Close
          </Button>
          <span role="status" className="sr-only">{downloading ? "Downloading original receipt..." : ""}</span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
