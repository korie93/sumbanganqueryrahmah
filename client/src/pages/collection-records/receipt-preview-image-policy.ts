import { isMobileViewportWidth } from "@/lib/responsive";

export const RECEIPT_IMAGE_PREVIEW_MAX_EDGE = 1_600;
export const RECEIPT_IMAGE_PREVIEW_MAX_PIXELS = 1_800_000;

export type ReceiptImagePreviewProfile = {
  compact: boolean;
  maxEdge: number;
  maxPixels: number;
};

const COMPACT_RECEIPT_PREVIEW_MAX_EDGE = 1_280;
const COMPACT_RECEIPT_PREVIEW_MAX_PIXELS = 1_048_576;

/** Capture once per receipt; zoom can promote the compact profile once. */
export function resolveReceiptImagePreviewProfile(viewportWidth: number): ReceiptImagePreviewProfile {
  const compact = Number.isFinite(viewportWidth) && viewportWidth > 0 && isMobileViewportWidth(viewportWidth);
  return {
    compact,
    maxEdge: compact ? COMPACT_RECEIPT_PREVIEW_MAX_EDGE : RECEIPT_IMAGE_PREVIEW_MAX_EDGE,
    maxPixels: compact ? COMPACT_RECEIPT_PREVIEW_MAX_PIXELS : RECEIPT_IMAGE_PREVIEW_MAX_PIXELS,
  };
}
