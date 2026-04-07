import type { Dispatch, SetStateAction } from "react";
import { ExternalLink, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CollectionRecordReceipt } from "@/lib/api";

type ReceiptPreviewToolbarProps = {
  selectedReceipt: CollectionRecordReceipt | null;
  showDetails: boolean;
  setShowDetails: Dispatch<SetStateAction<boolean>>;
  showPdfFallback: boolean;
  safeSource: string | null;
  canZoom: boolean;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  isMobile: boolean;
};

export function ReceiptPreviewToolbar({
  selectedReceipt,
  showDetails,
  setShowDetails,
  showPdfFallback,
  safeSource,
  canZoom,
  zoom,
  setZoom,
  isMobile,
}: ReceiptPreviewToolbarProps) {
  return (
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
  );
}
