import type { CollectionReceiptFileType } from "./collection-receipt-security-shared";
import {
  validateImageDimensions,
  type ImageDimensions,
} from "./collection-receipt-image-security-shared";
import {
  extractJpegDimensions,
  stripJpegMetadata,
  validateJpegStructure,
} from "./collection-receipt-jpeg-security-utils";
import {
  extractPngDimensions,
  stripPngMetadata,
  validatePngStructure,
} from "./collection-receipt-png-security-utils";
import {
  extractWebpDimensions,
  stripWebpMetadata,
  validateWebpStructure,
} from "./collection-receipt-webp-security-utils";

export function sanitizeCollectionReceiptImageBuffer(
  buffer: Buffer,
  signatureType: Exclude<CollectionReceiptFileType, "pdf">,
): { buffer: Buffer; removedMetadataKinds: string[]; dimensions: ImageDimensions } {
  if (signatureType === "png") {
    validatePngStructure(buffer);
  } else if (signatureType === "jpg") {
    validateJpegStructure(buffer);
  } else {
    validateWebpStructure(buffer);
  }

  const stripped = signatureType === "png"
    ? stripPngMetadata(buffer)
    : signatureType === "jpg"
      ? stripJpegMetadata(buffer)
      : stripWebpMetadata(buffer);
  const sanitizedBuffer = stripped.buffer;

  if (signatureType === "png") {
    validatePngStructure(sanitizedBuffer);
  } else if (signatureType === "jpg") {
    validateJpegStructure(sanitizedBuffer);
  } else {
    validateWebpStructure(sanitizedBuffer);
  }

  const dimensions = signatureType === "png"
    ? extractPngDimensions(sanitizedBuffer)
    : signatureType === "jpg"
      ? extractJpegDimensions(sanitizedBuffer)
      : extractWebpDimensions(sanitizedBuffer);

  return {
    buffer: sanitizedBuffer,
    removedMetadataKinds: stripped.removedMetadataKinds,
    dimensions: validateImageDimensions(dimensions),
  };
}
