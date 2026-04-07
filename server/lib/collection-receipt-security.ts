import {
  COLLECTION_RECEIPT_MAX_IMAGE_EDGE,
  COLLECTION_RECEIPT_MAX_IMAGE_PIXELS,
  CollectionReceiptSecurityError,
  type CollectionReceiptFileType,
  type CollectionReceiptSecurityResult,
} from "./collection-receipt-security-shared";
import {
  COLLECTION_RECEIPT_SIGNATURE_SCAN_BYTES,
  detectCollectionReceiptSignature,
  validatePdfCollectionReceiptBuffer,
} from "./collection-receipt-format-security";
import { sanitizeCollectionReceiptImageBuffer } from "./collection-receipt-image-security";

export {
  COLLECTION_RECEIPT_MAX_IMAGE_EDGE,
  COLLECTION_RECEIPT_MAX_IMAGE_PIXELS,
  CollectionReceiptSecurityError,
  type CollectionReceiptFileType,
  type CollectionReceiptSecurityResult,
};
export { detectCollectionReceiptSignature } from "./collection-receipt-format-security";
export { COLLECTION_RECEIPT_SIGNATURE_SCAN_BYTES } from "./collection-receipt-format-security";

export function validateCollectionReceiptSecurity(
  buffer: Buffer,
  signatureType: CollectionReceiptFileType,
): { imageWidth?: number; imageHeight?: number } {
  const result = sanitizeCollectionReceiptBuffer(buffer, signatureType);
  return {
    imageWidth: result.imageWidth,
    imageHeight: result.imageHeight,
  };
}

export function sanitizeCollectionReceiptBuffer(
  buffer: Buffer,
  signatureType: CollectionReceiptFileType,
): CollectionReceiptSecurityResult {
  if (signatureType === "pdf") {
    validatePdfCollectionReceiptBuffer(buffer);
    return {
      buffer,
      strippedMetadata: false,
      removedMetadataKinds: [],
    };
  }

  const sanitized = sanitizeCollectionReceiptImageBuffer(buffer, signatureType);

  return {
    buffer: sanitized.buffer,
    strippedMetadata: sanitized.removedMetadataKinds.length > 0,
    removedMetadataKinds: sanitized.removedMetadataKinds,
    imageWidth: sanitized.dimensions.width,
    imageHeight: sanitized.dimensions.height,
  };
}
