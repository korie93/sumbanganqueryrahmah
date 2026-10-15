import type { CollectionRecordReceipt } from "@/lib/api";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";

export const MIN_RECEIPT_PREVIEW_ZOOM = 0.5;
export const MAX_RECEIPT_IMAGE_PREVIEW_ZOOM = 1.75;
export const RECEIPT_PREVIEW_ROTATION_STEP_DEGREES = 90;

export function clampReceiptPreviewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(
    MAX_RECEIPT_IMAGE_PREVIEW_ZOOM,
    Math.max(MIN_RECEIPT_PREVIEW_ZOOM, Number(zoom.toFixed(2))),
  );
}

export function getReceiptPreviewImageLayout({
  naturalWidth,
  naturalHeight,
  availableWidth,
  zoom,
  rotationDegrees,
}: {
  naturalWidth: number;
  naturalHeight: number;
  availableWidth: number;
  zoom: number;
  rotationDegrees: number;
}) {
  const width = Math.max(1, naturalWidth);
  const height = Math.max(1, naturalHeight);
  const rotated = normalizeReceiptPreviewRotation(rotationDegrees) % 180 !== 0;
  const fitScale = Math.min(1, Math.max(1, availableWidth) / (rotated ? height : width));
  const scale = fitScale * clampReceiptPreviewZoom(zoom);
  const imageWidth = width * scale;
  const imageHeight = height * scale;

  return {
    imageWidth,
    imageHeight,
    canvasWidth: rotated ? imageHeight : imageWidth,
    canvasHeight: rotated ? imageWidth : imageHeight,
  };
}

export function getReceiptPreviewZoomValue(zoom: number): string {
  return String(clampReceiptPreviewZoom(zoom));
}

export function normalizeReceiptPreviewRotation(rotationDegrees: number): number {
  const normalized = rotationDegrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function shouldShowReceiptPreviewZoomControls({
  kind,
  safeSource,
}: {
  kind: ReceiptPreviewKind;
  safeSource: string | null;
}): boolean {
  return Boolean(safeSource) && kind === "image";
}

export function resolveSelectedReceipt(
  receipts: CollectionRecordReceipt[],
  selectedReceiptId: string | null,
): CollectionRecordReceipt | null {
  return receipts.find((receipt) => receipt.id === selectedReceiptId) || receipts[0] || null;
}
