import fs from "fs";
import {
  CollectionReceiptSecurityError,
  detectCollectionReceiptSignature,
  type CollectionReceiptFileType,
} from "../lib/collection-receipt-security";
import type { CollectionReceiptPayload } from "./collection.validation";
import {
  COLLECTION_RECEIPT_ALLOWED_MIME,
  COLLECTION_RECEIPT_MAX_BYTES,
  normalizeCollectionReceiptMimeType,
} from "./collection-receipt-file-type-utils";
import {
  buildStoredCollectionReceiptFile,
  sanitizeAndInspectCollectionReceiptBuffer,
  type StoredCollectionReceiptFile,
  validateCollectionReceiptDeclaredMetadata,
} from "./collection-receipt-save-utils";
import {
  extractReceiptBuffer,
  logCollectionReceiptBestEffortFailure,
  persistCollectionReceiptFile,
  quarantineRejectedCollectionReceipt,
} from "./collection-receipt-storage-utils";

export async function saveCollectionReceipt(
  receipt: CollectionReceiptPayload,
): Promise<StoredCollectionReceiptFile> {
  const declaredMimeType = normalizeCollectionReceiptMimeType(receipt.mimeType || "");
  const declaredMimeTypeAccepted = COLLECTION_RECEIPT_ALLOWED_MIME.has(declaredMimeType);

  const buffer = extractReceiptBuffer(receipt);
  if (!buffer) {
    throw new Error("Invalid receipt payload.");
  }

  if (buffer.length > COLLECTION_RECEIPT_MAX_BYTES) {
    throw new Error("Receipt file exceeds 5MB.");
  }

  let signatureType: CollectionReceiptFileType | null = null;
  let stagedFilePath: string | null = null;
  try {
    signatureType = detectCollectionReceiptSignature(buffer);
    if (!signatureType) {
      throw new CollectionReceiptSecurityError(
        "Receipt file signature is not allowed.",
        "receipt-signature-not-allowed",
      );
    }

    const fileName = String(receipt.fileName || "receipt");
    validateCollectionReceiptDeclaredMetadata({
      fileName: fileName.trim(),
      declaredMimeType,
      declaredMimeTypeAccepted,
      signatureType,
    });

    const prepared = await sanitizeAndInspectCollectionReceiptBuffer({
      fileName,
      buffer,
      signatureType,
    });
    const persisted = await persistCollectionReceiptFile({
      fileName,
      signatureType,
      buffer: prepared.sanitizedBuffer,
    });

    return buildStoredCollectionReceiptFile({
      storedReceipt: persisted.storedReceipt,
      inspection: prepared.inspection,
      fileSize: prepared.sanitizedBuffer.length,
    });
  } catch (error) {
    stagedFilePath = (error as Error & { receiptTemporaryFilePath?: string }).receiptTemporaryFilePath || null;
    if (error instanceof CollectionReceiptSecurityError) {
      await quarantineRejectedCollectionReceipt({
        source: "base64",
        fileName: receipt.fileName,
        mimeType: receipt.mimeType,
        signatureType,
        rejectionError: error,
        buffer: stagedFilePath ? null : buffer,
        filePath: stagedFilePath,
      });
    }
    if (stagedFilePath) {
      await fs.promises.rm(stagedFilePath, { force: true }).catch((cleanupError) => {
        logCollectionReceiptBestEffortFailure(
          "Failed to remove staged collection receipt after base64 save failure",
          {
            fileName: receipt.fileName || null,
            temporaryFilePath: stagedFilePath,
            error: cleanupError,
          },
        );
      });
    }
    throw error;
  }
}
