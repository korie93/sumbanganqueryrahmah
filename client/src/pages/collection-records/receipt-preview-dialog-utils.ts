import type { CollectionRecordReceipt } from "@/lib/api";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";

export const MIN_RECEIPT_PREVIEW_ZOOM = 0.5;
export const MAX_RECEIPT_IMAGE_PREVIEW_ZOOM = 2;

export function clampReceiptPreviewZoom(zoom: number): number {
  return Math.min(
    MAX_RECEIPT_IMAGE_PREVIEW_ZOOM,
    Math.max(MIN_RECEIPT_PREVIEW_ZOOM, Number(zoom.toFixed(2))),
  );
}

export function getReceiptPreviewZoomValue(zoom: number): string {
  return String(clampReceiptPreviewZoom(zoom));
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
