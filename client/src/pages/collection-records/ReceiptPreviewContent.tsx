import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getPdfPreviewIframeProps,
  resolveSafeInlineIframePreviewUrl,
} from "@/lib/iframe-preview";
import { cn } from "@/lib/utils";
import type { CollectionRecordReceipt } from "@/lib/api";
import { getReceiptPreviewImageLayout } from "@/pages/collection-records/receipt-preview-dialog-utils";
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
  imageIdentity?: string;
  selectedReceipt: CollectionRecordReceipt | null;
  onRetry?: (() => void) | undefined;
};

function ReceiptPreviewMessage({ message, error = false, onRetry }: { message: string; error?: boolean; onRetry?: (() => void) | undefined }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-3 text-center text-sm text-muted-foreground">
      <div className="flex min-h-full flex-col items-center justify-center gap-3">
        <p role={error ? "alert" : "status"}>{message}</p>
        {error && onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry} className="shrink-0">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Retry preview
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ReceiptPreviewLoading({ message = "Loading preview..." }: { message?: string }) {
  return (
    <div role="status" className="flex h-full min-h-0 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {message}
    </div>
  );
}

type ReceiptPdfPreviewFrameProps = {
  source: string;
  iframePreviewProps: ReturnType<typeof getPdfPreviewIframeProps>;
  onRetry?: (() => void) | undefined;
};

function ReceiptPdfPreviewFrame({ source, iframePreviewProps, onRetry }: ReceiptPdfPreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    // Strict Mode replays setup after cleanup against the same DOM element.
    frame?.setAttribute("src", source);
    return () => {
      if (frame) {
        frame.removeAttribute("src");
        frame.src = "about:blank";
      }
    };
  }, [source]);

  if (failed) {
    return <ReceiptPreviewMessage error message="The PDF could not be displayed. Retry or open the original PDF below." onRetry={onRetry} />;
  }

  // Native PDF viewers do not consistently emit iframe load events. The
  // authenticated fetch already has a loading state; do not cover a ready file
  // with an overlay that could remain indefinitely. Open PDF stays available.
  return (
    <div className="relative h-full min-h-0">
      <iframe
        key={source}
        ref={frameRef}
        src={source}
        title="Receipt PDF Preview"
        className="h-full w-full rounded-sm border-0 bg-white"
        loading="lazy"
        onError={() => setFailed(true)}
        {...iframePreviewProps}
      />
    </div>
  );
}

type ReceiptImagePreviewProps = {
  source: string;
  alt: string;
  zoomValue: string;
  rotationDegrees: number;
  onRetry?: (() => void) | undefined;
};

const RECEIPT_IMAGE_BASE_DISPLAY_WIDTH_PX = 960;
const RECEIPT_IMAGE_BASE_DISPLAY_HEIGHT_PX = 1_280;
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function cleanupReceiptImagePreviewElement(image: Pick<HTMLImageElement, "removeAttribute">): void {
  image.removeAttribute("src");
}

function ReceiptImagePreview({ source, alt, zoomValue, rotationDegrees, onRetry }: ReceiptImagePreviewProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const latestSourceRef = useRef(source);
  latestSourceRef.current = source;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [naturalSize, setNaturalSize] = useState({ width: RECEIPT_IMAGE_BASE_DISPLAY_WIDTH_PX, height: RECEIPT_IMAGE_BASE_DISPLAY_HEIGHT_PX });

  useEffect(() => {
    const image = imageRef.current;
    const scroller = scrollerRef.current;
    const canvas = canvasRef.current;
    if (!image || !scroller || !canvas) return;

    const updateLayout = () => {
      const padding = getComputedStyle(scroller);
      const availableWidth = scroller.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
      const layout = getReceiptPreviewImageLayout({
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        availableWidth,
        zoom: Number(zoomValue),
        rotationDegrees,
      });
      canvas.style.setProperty("--receipt-preview-canvas-width", `${layout.canvasWidth}px`);
      canvas.style.setProperty("--receipt-preview-canvas-height", `${layout.canvasHeight}px`);
      image.style.setProperty("--receipt-preview-display-width", `${layout.imageWidth}px`);
      image.style.setProperty("--receipt-preview-display-height", `${layout.imageHeight}px`);
      image.style.setProperty("--receipt-preview-rotation", `${rotationDegrees}deg`);
    };
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [naturalSize, rotationDegrees, status, zoomValue]);

  // Clear the source before React removes the image from the document, while
  // keeping setup symmetric so StrictMode replay restores the active source.
  useClientLayoutEffect(() => {
    const image = imageRef.current;
    image?.setAttribute("src", latestSourceRef.current);
    return () => {
      if (image) cleanupReceiptImagePreviewElement(image);
    };
  }, []);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollLeft = 0;
      scrollerRef.current.scrollTop = 0;
    }
  }, [rotationDegrees, zoomValue]);

  if (status === "error") {
    return <ReceiptPreviewMessage error message="The receipt image could not be displayed. Retry or download the original below." onRetry={onRetry} />;
  }

  return (
    <div className="relative h-full min-h-0" aria-busy={status === "loading"}>
      {status === "loading" ? <div className="absolute inset-0"><ReceiptPreviewLoading message="Loading receipt image..." /></div> : null}
      <div
        ref={scrollerRef}
        className={cn("receipt-preview-image-scroller h-full overflow-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", status === "loading" && "invisible")}
        role="region"
        aria-label="Receipt image viewer. Scroll to inspect the receipt."
        tabIndex={0}
      >
        <div className="receipt-preview-image-stage">
          <div ref={canvasRef} className="receipt-preview-image-canvas">
            <img
              ref={imageRef}
              src={source}
              alt={alt}
              width={RECEIPT_IMAGE_BASE_DISPLAY_WIDTH_PX}
              height={RECEIPT_IMAGE_BASE_DISPLAY_HEIGHT_PX}
              className="receipt-preview-image block rounded-sm object-contain"
              decoding="async"
              draggable={false}
              loading="eager"
              onLoad={(event) => {
                const image = event.currentTarget;
                setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
                setStatus("ready");
              }}
              onError={() => setStatus("error")}
            />
          </div>
        </div>
      </div>
    </div>
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
  imageIdentity,
  selectedReceipt,
  onRetry,
}: ReceiptPreviewContentProps) {
  const safeInlinePdfSource = kind === "pdf" ? resolveSafeInlineIframePreviewUrl(safeSource, { allowBlob: true }) : null;
  const pdfIframePreviewProps = getPdfPreviewIframeProps(safeInlinePdfSource, { trustedBlobSource: Boolean(safeInlinePdfSource) });

  return (
    <div
      className={cn("min-h-0 flex-1 overflow-hidden rounded-md border border-border/60 bg-background/40", isMobile ? "mx-3 my-2" : "mt-2")}
      aria-busy={loading}
    >
      {loading ? <ReceiptPreviewLoading /> : error ? (
        <ReceiptPreviewMessage error message={error} onRetry={onRetry} />
      ) : !safeSource ? (
        <ReceiptPreviewMessage message={hasUnsafeSource ? "Preview URL was blocked for safety." : "Preview is unavailable. Download the original file below."} />
      ) : showPdfFallback ? (
        <div className="h-full overflow-y-auto p-4">
          <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-3 text-center">
            <FileText className="mx-auto h-9 w-9 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold">PDF ready to open</p>
            <p role="status" className="text-sm leading-6 text-muted-foreground">Use Open PDF below to view this receipt in your browser, or download the original.</p>
            <p className="break-all text-xs text-muted-foreground">{fileName || selectedReceipt?.originalFileName || "receipt.pdf"}</p>
          </div>
        </div>
      ) : kind === "pdf" ? (
        safeInlinePdfSource ? (
          <ReceiptPdfPreviewFrame key={safeInlinePdfSource} source={safeInlinePdfSource} iframePreviewProps={pdfIframePreviewProps} onRetry={onRetry} />
        ) : <ReceiptPreviewMessage message="Inline PDF preview is limited to trusted local receipt sources. Open or download the original below." />
      ) : kind === "image" ? (
        <ReceiptImagePreview key={imageIdentity ?? safeSource} source={safeSource} alt={fileName || "Receipt preview"} zoomValue={zoomValue} rotationDegrees={rotationDegrees} onRetry={onRetry} />
      ) : <ReceiptPreviewMessage message="Preview is unavailable for this file type. Download the original below." />}
    </div>
  );
}
