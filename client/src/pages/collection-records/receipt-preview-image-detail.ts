import { fetchCollectionReceiptBlob } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { optimizeImageBlobForPreview, RECEIPT_IMAGE_PREVIEW_MAX_EDGE, RECEIPT_IMAGE_PREVIEW_MAX_PIXELS } from "./preview";
import { inferReceiptMimeTypeFromName } from "./utils";
import type { ReceiptImagePreviewProfile } from "./receipt-preview-image-policy";

/** Keep fetching and image preparation behind the receipt action boundary. */
export async function prepareReceiptPreview({ recordId, receiptId, signal, isCurrent, profile, fallbackMimeType, fallbackFileName }: {
  recordId: string;
  receiptId: string | null;
  signal: AbortSignal;
  isCurrent: () => boolean;
  profile: ReceiptImagePreviewProfile;
  fallbackMimeType: string;
  fallbackFileName: string;
}) {
  const { blob, mimeType, fileName } = await fetchCollectionReceiptBlob(recordId, "view", receiptId, { signal });
  if (!isCurrent()) return null;
  const effectiveMimeType = mimeType || fallbackMimeType || inferReceiptMimeTypeFromName(fileName || "");
  const previewBlob = effectiveMimeType.startsWith("image/")
    ? await optimizeImageBlobForPreview(blob, { signal, maxEdge: profile.maxEdge, maxPixels: profile.maxPixels })
    : blob;
  return { blob: previewBlob, mimeType: previewBlob.type || effectiveMimeType || "application/octet-stream", fileName: fileName || fallbackFileName };
}

export async function downloadReceiptOriginal({ recordId, receiptId, signal, isCurrent, fallbackFileName }: {
  recordId: string;
  receiptId: string | undefined;
  signal: AbortSignal;
  isCurrent: () => boolean;
  fallbackFileName: string;
}): Promise<void> {
  const { blob, fileName } = await fetchCollectionReceiptBlob(recordId, "download", receiptId, { signal });
  if (isCurrent()) downloadBlob(blob, fileName || fallbackFileName || "receipt");
}

/** Loaded only when a compact image needs more detail. Caller owns its URL. */
export async function prepareReceiptImageDetail({ recordId, receiptId, signal, isCurrent, publish }: {
  recordId: string;
  receiptId: string | undefined;
  signal: AbortSignal;
  isCurrent: () => boolean;
  publish: (source: string) => void;
}): Promise<void> {
  const { blob } = await fetchCollectionReceiptBlob(recordId, "view", receiptId, { signal });
  if (!isCurrent()) return;
  if (!blob.type.startsWith("image/")) throw new Error("Expected an image preview.");
  const previewBlob = await optimizeImageBlobForPreview(blob, {
    signal, maxEdge: RECEIPT_IMAGE_PREVIEW_MAX_EDGE,
    maxPixels: RECEIPT_IMAGE_PREVIEW_MAX_PIXELS, throwOnError: true,
  });
  if (!isCurrent()) return;
  const source = URL.createObjectURL(previewBlob);
  if (!isCurrent()) { URL.revokeObjectURL(source); return; }
  publish(source);
}
