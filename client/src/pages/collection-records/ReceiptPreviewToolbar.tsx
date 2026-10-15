import type { Dispatch, SetStateAction } from "react";
import { Info, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import {
  clampReceiptPreviewZoom,
  MAX_RECEIPT_IMAGE_PREVIEW_ZOOM,
  MIN_RECEIPT_PREVIEW_ZOOM,
  RECEIPT_PREVIEW_ROTATION_STEP_DEGREES,
} from "@/pages/collection-records/receipt-preview-dialog-utils";

type ReceiptPreviewToolbarProps = {
  detailsId: string;
  showDetails: boolean;
  setShowDetails: Dispatch<SetStateAction<boolean>>;
  canShowDetails: boolean;
  canZoom: boolean;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  setRotationDegrees: Dispatch<SetStateAction<number>>;
  isMobile: boolean;
};

export function ReceiptPreviewToolbar({
  detailsId,
  showDetails,
  setShowDetails,
  canShowDetails,
  canZoom,
  zoom,
  setZoom,
  setRotationDegrees,
  isMobile,
}: ReceiptPreviewToolbarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2",
        isMobile ? "mx-3 mt-2" : "mt-2",
      )}
      data-floating-ai-avoid="true"
    >
      {canZoom ? (
        <div className="flex items-center gap-1" role="group" aria-label="Image controls">
          <Button type="button" size="sm" variant="outline" onClick={() => setZoom(1)} aria-label="Fit receipt to viewer width">
            Fit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setZoom((previous) => clampReceiptPreviewZoom(previous - 0.1))}
            disabled={zoom <= MIN_RECEIPT_PREVIEW_ZOOM}
            aria-label="Zoom out"
            title="Zoom out"
            className="w-9 px-0"
          >
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-muted-foreground" aria-live="polite" aria-atomic="true">
            {Math.round(zoom * 100)}% fit
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setZoom((previous) => clampReceiptPreviewZoom(previous + 0.1))}
            disabled={zoom >= MAX_RECEIPT_IMAGE_PREVIEW_ZOOM}
            aria-label="Zoom in"
            title="Zoom in"
            className="w-9 px-0"
          >
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setRotationDegrees((previous) => (previous + RECEIPT_PREVIEW_ROTATION_STEP_DEGREES) % 360)}
            aria-label="Rotate receipt clockwise"
            title="Rotate clockwise"
            className="w-9 px-0"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      {canShowDetails ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setShowDetails((previous) => !previous)}
          {...getAriaExpandedProps(showDetails)}
          aria-controls={detailsId}
          className="ml-auto"
        >
          <Info className="mr-2 h-4 w-4" aria-hidden="true" />
          {showDetails ? "Hide details" : "Details"}
        </Button>
      ) : null}
    </div>
  );
}
