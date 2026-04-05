import { createHash } from "node:crypto";
import {
  CollectionReceiptSecurityError,
  sanitizeCollectionReceiptBuffer,
  type CollectionReceiptFileType,
} from "../lib/collection-receipt-security";
import type { CreateCollectionRecordReceiptInput } from "../storage-postgres";
import {
  COLLECTION_RECEIPT_TYPE_CONFIG,
  mapCollectionReceiptExtensionToType,
  mapCollectionReceiptMimeToType,
} from "./collection-receipt-file-type-utils";
import { logCollectionReceiptSanitization } from "./collection-receipt-storage-utils";

export type StoredCollectionReceiptFile = CreateCollectionRecordReceiptInput & {
  extractionMessage?: string | null;
};

export type CollectionReceiptInspectionResult = {
  fileHash: string | null;
  extractedAmountCents: number | null;
  extractionStatus: CreateCollectionRecordReceiptInput["extractionStatus"];
  extractionConfidence: number | null;
  extractionMessage: string | null;
};

export async function inspectCollectionReceiptBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  imageWidth?: number;
  imageHeight?: number;
}): Promise<CollectionReceiptInspectionResult> {
  return {
    fileHash: createHash("sha256").update(params.buffer).digest("hex"),
    extractedAmountCents: null,
    extractionStatus: "unprocessed",
    extractionConfidence: null,
    extractionMessage: null,
  };
}

export async function sanitizeAndInspectCollectionReceiptBuffer(params: {
  fileName: string;
  buffer: Buffer;
  signatureType: CollectionReceiptFileType;
}) {
  const sanitized = sanitizeCollectionReceiptBuffer(params.buffer, params.signatureType);
  logCollectionReceiptSanitization({
    fileName: params.fileName,
    signatureType: params.signatureType,
    sanitizedBuffer: sanitized.buffer,
    originalBytes: params.buffer.length,
    removedMetadataKinds: sanitized.removedMetadataKinds,
    imageWidth: sanitized.imageWidth,
    imageHeight: sanitized.imageHeight,
  });

  const inspection = await inspectCollectionReceiptBuffer({
    buffer: sanitized.buffer,
    mimeType: resolveCanonicalReceiptMimeType(params.signatureType),
    imageWidth: sanitized.imageWidth,
    imageHeight: sanitized.imageHeight,
  });

  return {
    sanitizedBuffer: sanitized.buffer,
    inspection,
    removedMetadataKinds: sanitized.removedMetadataKinds,
    imageWidth: sanitized.imageWidth,
    imageHeight: sanitized.imageHeight,
  };
}

export function validateCollectionReceiptDeclaredMetadata(params: {
  fileName: string;
  declaredMimeType: string;
  declaredMimeTypeAccepted: boolean;
  signatureType: CollectionReceiptFileType;
}): void {
  const extensionType = params.fileName.includes(".")
    ? mapCollectionReceiptExtensionToType(
        params.fileName.slice(params.fileName.lastIndexOf(".")),
      )
    : null;
  if (params.fileName.includes(".") && !extensionType) {
    throw new CollectionReceiptSecurityError(
      "Receipt file extension is not allowed.",
      "receipt-extension-not-allowed",
    );
  }
  if (extensionType && extensionType !== params.signatureType) {
    throw new CollectionReceiptSecurityError(
      "Receipt file content does not match file extension.",
      "receipt-extension-mismatch",
    );
  }

  const mimeTypeResolved = params.declaredMimeTypeAccepted
    ? mapCollectionReceiptMimeToType(params.declaredMimeType)
    : null;
  if (mimeTypeResolved && mimeTypeResolved !== params.signatureType) {
    throw new CollectionReceiptSecurityError(
      "Receipt file content does not match declared MIME type.",
      "receipt-mime-mismatch",
    );
  }
}

export function buildStoredCollectionReceiptFile(params: {
  storedReceipt: {
    storagePath: string;
    originalFileName: string;
    canonicalType: {
      mimeType: string;
      extension: string;
    };
  };
  inspection: CollectionReceiptInspectionResult;
  fileSize: number;
}): StoredCollectionReceiptFile {
  return {
    storagePath: params.storedReceipt.storagePath,
    originalFileName: params.storedReceipt.originalFileName,
    originalMimeType: params.storedReceipt.canonicalType.mimeType,
    originalExtension: params.storedReceipt.canonicalType.extension,
    fileSize: params.fileSize,
    fileHash: params.inspection.fileHash,
    extractedAmountCents: params.inspection.extractedAmountCents,
    extractionStatus: params.inspection.extractionStatus,
    extractionConfidence: params.inspection.extractionConfidence,
    extractionMessage: params.inspection.extractionMessage,
  };
}

export function resolveCanonicalReceiptMimeType(
  signatureType: CollectionReceiptFileType,
): string {
  return COLLECTION_RECEIPT_TYPE_CONFIG[signatureType].mimeType;
}
