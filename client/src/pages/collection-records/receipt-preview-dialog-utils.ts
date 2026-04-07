import type { CollectionRecordReceipt } from "@/lib/api";

export function clampReceiptPreviewZoom(zoom: number): number {
  return Math.min(3, Math.max(0.5, Number(zoom.toFixed(2))));
}

export function getReceiptPreviewZoomClass(zoom: number): string {
  const clamped = clampReceiptPreviewZoom(zoom);
  const zoomStep = Math.round(clamped * 10);
  return `receipt-preview-zoom-${zoomStep}`;
}

export function resolveSelectedReceipt(
  receipts: CollectionRecordReceipt[],
  selectedReceiptId: string | null,
): CollectionRecordReceipt | null {
  return receipts.find((receipt) => receipt.id === selectedReceiptId) || receipts[0] || null;
}
