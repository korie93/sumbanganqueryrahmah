import type { CollectionRecordReceipt } from "@/lib/api";

export function clampReceiptPreviewZoom(zoom: number): number {
  return Math.min(3, Math.max(0.5, Number(zoom.toFixed(2))));
}

export type ReceiptPreviewZoomStyle = {
  "--receipt-preview-zoom": string;
};

export function getReceiptPreviewZoomStyle(zoom: number): ReceiptPreviewZoomStyle {
  return {
    "--receipt-preview-zoom": String(clampReceiptPreviewZoom(zoom)),
  };
}

export function resolveSelectedReceipt(
  receipts: CollectionRecordReceipt[],
  selectedReceiptId: string | null,
): CollectionRecordReceipt | null {
  return receipts.find((receipt) => receipt.id === selectedReceiptId) || receipts[0] || null;
}
