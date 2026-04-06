import {
  COLLECTION_RECEIPT_MAX_IMAGE_EDGE,
  COLLECTION_RECEIPT_MAX_IMAGE_PIXELS,
  type CollectionReceiptSecurityError,
  createCollectionReceiptSecurityError,
} from "./collection-receipt-security-shared";

export type ImageDimensions = { width: number; height: number };

export function securityError(message: string, reasonCode: string): CollectionReceiptSecurityError {
  return createCollectionReceiptSecurityError(message, reasonCode);
}

export function readUInt24LE(buffer: Buffer, offset: number): number | null {
  if (offset < 0 || offset + 2 >= buffer.length) {
    return null;
  }

  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

export function validateImageDimensions(dimensions: ImageDimensions | null): ImageDimensions {
  if (!dimensions) {
    throw securityError("Receipt image dimensions could not be verified.", "image-dimensions-unverified");
  }

  const { width, height } = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw securityError("Receipt image dimensions are invalid.", "image-dimensions-invalid");
  }

  if (width > COLLECTION_RECEIPT_MAX_IMAGE_EDGE || height > COLLECTION_RECEIPT_MAX_IMAGE_EDGE) {
    throw securityError(
      `Receipt image dimensions exceed the ${COLLECTION_RECEIPT_MAX_IMAGE_EDGE}px maximum edge.`,
      "image-dimensions-edge-exceeded",
    );
  }

  if (width * height > COLLECTION_RECEIPT_MAX_IMAGE_PIXELS) {
    throw securityError(
      "Receipt image dimensions exceed the maximum pixel allowance.",
      "image-dimensions-pixel-exceeded",
    );
  }

  return { width, height };
}

export function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
