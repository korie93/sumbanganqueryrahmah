export type CollectionReceiptFileType = "pdf" | "png" | "jpg" | "webp";

export class CollectionReceiptSecurityError extends Error {
  reasonCode: string;

  constructor(message: string, reasonCode = "receipt-security-rejected") {
    super(message);
    this.name = "CollectionReceiptSecurityError";
    this.reasonCode = reasonCode;
  }
}

export const COLLECTION_RECEIPT_MAX_IMAGE_EDGE = 10_000;
export const COLLECTION_RECEIPT_MAX_IMAGE_PIXELS = 40_000_000;

export type CollectionReceiptSecurityResult = {
  buffer: Buffer;
  strippedMetadata: boolean;
  removedMetadataKinds: string[];
  imageWidth?: number;
  imageHeight?: number;
};

export function createCollectionReceiptSecurityError(
  message: string,
  reasonCode: string,
): CollectionReceiptSecurityError {
  return new CollectionReceiptSecurityError(message, reasonCode);
}
