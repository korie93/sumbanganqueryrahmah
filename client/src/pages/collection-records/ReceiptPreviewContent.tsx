import { Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  zoomClassName: string;
  fileName: string;
  selectedReceipt: CollectionRecordReceipt | null;
  downloading: boolean;
  onDownload: () => void;
};

export function ReceiptPreviewContent({
  loading,
  error,
  safeSource,
  hasUnsafeSource,
  showPdfFallback,
  kind,
  isMobile,
  zoomClassName,
  fileName,
  selectedReceipt,
  downloading,
  onDownload,
}: ReceiptPreviewContentProps) {
  return (
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
          <div className={cn("mx-auto w-full", isMobile ? "h-full" : "h-[72vh]", zoomClassName)}>
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
  );
}
