import { useEffect, useRef } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getPdfPreviewIframeProps,
  resolveSafeInlineIframePreviewUrl,
} from "@/lib/iframe-preview";
import { cn } from "@/lib/utils";
import type { CollectionRecordReceipt } from "@/lib/api";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";

type ReceiptPreviewContentProps = {
  loading: boolean;
  error: string;
  safeSource: string | null;
  hasUnsafeSource: boolean;
  showPdfFallback: boolean;
  kind: ReceiptPreviewKind;
  isMobile: boolean;
  zoomValue: string;
  rotationDegrees: number;
  fileName: string;
  selectedReceipt: CollectionRecordReceipt | null;
  downloading: boolean;
  onDownload: () => void;
};

type ReceiptPdfPreviewFrameProps = {
  source: string;
  iframePreviewProps: ReturnType<typeof getPdfPreviewIframeProps>;
};

function ReceiptPdfPreviewFrame({
  source,
  iframePreviewProps,
}: ReceiptPdfPreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const frame = frameRef.current;

    return () => {
      if (frame) {
        frame.removeAttribute("src");
        frame.src = "about:blank";
      }
    };
  }, [source]);

  return (
    <iframe
      key={source}
      ref={frameRef}
      src={source}
      title="Receipt PDF Preview"
      className="h-full w-full rounded-sm border-0 bg-white"
      loading="lazy"
      {...iframePreviewProps}
    />
  );
}

type ReceiptImagePreviewProps = {
  source: string;
  alt: string;
  className: string;
  zoomValue: string;
  rotationDegrees: number;
};

const RECEIPT_IMAGE_BASE_DISPLAY_WIDTH_PX = 960;
const RECEIPT_IMAGE_MAX_DISPLAY_WIDTH_PX = 1_520;

function ReceiptImagePreview({
  source,
  alt,
  className,
  zoomValue,
  rotationDegrees,
}: ReceiptImagePreviewProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    const zoom = Number(zoomValue);
    const displayWidth = Number.isFinite(zoom)
      ? Math.min(
          RECEIPT_IMAGE_MAX_DISPLAY_WIDTH_PX,
          Math.round(RECEIPT_IMAGE_BASE_DISPLAY_WIDTH_PX * zoom),
        )
      : RECEIPT_IMAGE_BASE_DISPLAY_WIDTH_PX;

    image.style.setProperty("--receipt-preview-display-width", `${displayWidth}px`);
    image.style.setProperty("--receipt-preview-rotation", `${rotationDegrees}deg`);
    image.dataset.rotation = String(rotationDegrees);
  }, [rotationDegrees, zoomValue]);

  useEffect(() => {
    const image = imageRef.current;

    return () => {
      if (image) {
        image.removeAttribute("src");
        image.src = "";
      }
    };
  }, [source]);

  return (
    <img
      key={source}
      ref={imageRef}
      src={source}
      alt={alt}
      className={className}
      decoding="async"
      draggable={false}
    />
  );
}

export function ReceiptPreviewContent({
  loading,
  error,
  safeSource,
  hasUnsafeSource,
  showPdfFallback,
  kind,
  isMobile,
  zoomValue,
  rotationDegrees,
  fileName,
  selectedReceipt,
  downloading,
  onDownload,
}: ReceiptPreviewContentProps) {
  const safeInlinePdfSource =
    kind === "pdf"
      ? resolveSafeInlineIframePreviewUrl(safeSource, { allowBlob: true })
      : null;
  const pdfIframePreviewProps = getPdfPreviewIframeProps(safeInlinePdfSource, {
    trustedBlobSource: Boolean(safeInlinePdfSource),
  });

  return (
    <div
      className={cn(
        "min-h-0 flex-1 rounded-md border border-border/60 bg-background/40 p-3",
        isMobile ? "mx-3 my-3" : "mt-3",
      )}
    >
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
              <Button
                type="button"
                variant="outline"
                onClick={onDownload}
                disabled={downloading}
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                {downloading ? "Downloading..." : "Download Original"}
              </Button>
            </div>
          </div>
        </div>
      ) : kind === "pdf" ? (
        <div className="h-full overflow-auto">
          <div
            className={cn("mx-auto h-full w-full", isMobile ? "" : "min-h-[360px]")}
          >
            {safeInlinePdfSource ? (
              <ReceiptPdfPreviewFrame
                source={safeInlinePdfSource}
                iframePreviewProps={pdfIframePreviewProps}
              />
            ) : (
              <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                Inline PDF preview is limited to trusted local receipt sources. Use the download action to inspect the original file.
              </div>
            )}
          </div>
        </div>
      ) : kind === "image" ? (
        <div className="receipt-preview-image-scroller flex h-full items-start justify-center overflow-auto">
          <ReceiptImagePreview
            source={safeSource}
            alt={fileName || "Receipt preview"}
            zoomValue={zoomValue}
            rotationDegrees={rotationDegrees}
            className={cn(
              "receipt-preview-image block rounded-sm object-contain",
              isMobile ? "receipt-preview-image--mobile" : "",
            )}
          />
        </div>
      ) : (
        <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
          Preview not available for this file type.
        </div>
      )}
    </div>
  );
}
