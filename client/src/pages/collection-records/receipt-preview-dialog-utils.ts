import type { CollectionRecordReceipt } from "@/lib/api";

export function clampReceiptPreviewZoom(zoom: number): number {
  return Math.min(3, Math.max(0.5, Number(zoom.toFixed(2))));
}

export function getReceiptPreviewZoomValue(zoom: number): string {
  return String(clampReceiptPreviewZoom(zoom));
}

export function resolveSelectedReceipt(
  receipts: CollectionRecordReceipt[],
  selectedReceiptId: string | null,
): CollectionRecordReceipt | null {
  return receipts.find((receipt) => receipt.id === selectedReceiptId) || receipts[0] || null;
}
