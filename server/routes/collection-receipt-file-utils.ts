import fs from "fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CollectionReceiptSecurityError,
  detectCollectionReceiptSignature,
  sanitizeCollectionReceiptBuffer,
  type CollectionReceiptFileType,
} from "../lib/collection-receipt-security";
import type { CollectionReceiptPayload } from "./collection.validation";
import {
  buildStoredCollectionReceiptMetadata,
  COLLECTION_RECEIPT_ALLOWED_MIME,
  COLLECTION_RECEIPT_MAX_BYTES,
  isCollectionReceiptInlinePreviewMimeType,
  mapCollectionReceiptExtensionToType,
  normalizeCollectionReceiptMimeType,
  sanitizeReceiptDownloadName,
} from "./collection-receipt-file-type-utils";
import {
  buildStoredCollectionReceiptFile,
  inspectCollectionReceiptBuffer,
  resolveCanonicalReceiptMimeType,
  type StoredCollectionReceiptFile,
  validateCollectionReceiptDeclaredMetadata,
} from "./collection-receipt-save-utils";
import {
  removeCollectionReceiptFile,
  resolveCollectionReceiptFile,
} from "./collection-receipt-file-resolution-utils";
import {
  extractReceiptBuffer,
  finalizeStoredCollectionReceiptFile,
  logCollectionReceiptBestEffortFailure,
  logCollectionReceiptSanitization,
  persistCollectionReceiptFile,
  quarantineRejectedCollectionReceipt,
} from "./collection-receipt-storage-utils";

export {
  normalizeCollectionReceiptMimeType,
  sanitizeReceiptDownloadName,
  isCollectionReceiptInlinePreviewMimeType,
  logCollectionReceiptBestEffortFailure,
};
export type {
  CollectionReceiptInspectionResult,
  StoredCollectionReceiptFile,
} from "./collection-receipt-save-utils";

export type MultipartCollectionReceiptInput = {
  fileName?: string | null;
  mimeType?: string | null;
  stream: NodeJS.ReadableStream;
};

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
    validateCollectionReceiptDeclaredMetadata({
      fileName: String(receipt.fileName || "").trim(),
      declaredMimeType,
      declaredMimeTypeAccepted,
      signatureType,
    });

    const sanitized = sanitizeCollectionReceiptBuffer(buffer, signatureType);
    logCollectionReceiptSanitization({
      fileName: String(receipt.fileName || "receipt"),
      signatureType,
      sanitizedBuffer: sanitized.buffer,
      originalBytes: buffer.length,
      removedMetadataKinds: sanitized.removedMetadataKinds,
      imageWidth: sanitized.imageWidth,
      imageHeight: sanitized.imageHeight,
    });
    const inspection = await inspectCollectionReceiptBuffer({
      buffer: sanitized.buffer,
      mimeType: resolveCanonicalReceiptMimeType(signatureType),
      imageWidth: sanitized.imageWidth,
      imageHeight: sanitized.imageHeight,
    });

    const persisted = await persistCollectionReceiptFile({
      fileName: String(receipt.fileName || "receipt"),
      signatureType,
      buffer: sanitized.buffer,
    });

    return buildStoredCollectionReceiptFile({
      storedReceipt: persisted.storedReceipt,
      inspection,
      fileSize: sanitized.buffer.length,
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

export async function saveMultipartCollectionReceipt(
  receipt: MultipartCollectionReceiptInput,
): Promise<StoredCollectionReceiptFile> {
  const fileName = String(receipt.fileName || "receipt").trim();
  const declaredMimeType = normalizeCollectionReceiptMimeType(receipt.mimeType || "");
  const declaredMimeTypeAccepted = COLLECTION_RECEIPT_ALLOWED_MIME.has(declaredMimeType);

  const extensionType = mapCollectionReceiptExtensionToType(
    fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "",
  );
  if (fileName.includes(".") && !extensionType) {
    throw new Error("Receipt file extension is not allowed.");
  }

  const storedReceipt = buildStoredCollectionReceiptMetadata({
    fileName,
    signatureType: "pdf",
  });
  const temporaryFilePath = storedReceipt.absolutePath.replace(/\.[^.]+$/, ".upload");
  const signatureChunks: Buffer[] = [];
  let signatureBytesCaptured = 0;
  let fileSize = 0;
  let signatureType: CollectionReceiptFileType | null = null;

  const captureAndValidate = new Transform({
    transform(chunk, _encoding, callback) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      fileSize += bufferChunk.length;
      if (fileSize > COLLECTION_RECEIPT_MAX_BYTES) {
        callback(new Error("Receipt file exceeds 5MB."));
        return;
      }

      if (signatureBytesCaptured < 16) {
        const remainingBytes = 16 - signatureBytesCaptured;
        signatureChunks.push(bufferChunk.subarray(0, remainingBytes));
        signatureBytesCaptured += Math.min(bufferChunk.length, remainingBytes);
      }

      callback(null, bufferChunk);
    },
  });

  try {
    await pipeline(
      receipt.stream,
      captureAndValidate,
      fs.createWriteStream(temporaryFilePath, { flags: "wx" }),
    );

    if (!fileSize) {
      throw new Error("Invalid receipt payload.");
    }

    signatureType = detectCollectionReceiptSignature(Buffer.concat(signatureChunks));
    if (!signatureType) {
      throw new CollectionReceiptSecurityError(
        "Receipt file signature is not allowed.",
        "receipt-signature-not-allowed",
      );
    }
    validateCollectionReceiptDeclaredMetadata({
      fileName,
      declaredMimeType,
      declaredMimeTypeAccepted,
      signatureType,
    });

    const receiptBytes = await fs.promises.readFile(temporaryFilePath);
    const sanitized = sanitizeCollectionReceiptBuffer(receiptBytes, signatureType);
    logCollectionReceiptSanitization({
      fileName,
      signatureType,
      sanitizedBuffer: sanitized.buffer,
      originalBytes: receiptBytes.length,
      removedMetadataKinds: sanitized.removedMetadataKinds,
      imageWidth: sanitized.imageWidth,
      imageHeight: sanitized.imageHeight,
    });
    const inspection = await inspectCollectionReceiptBuffer({
      buffer: sanitized.buffer,
      mimeType: resolveCanonicalReceiptMimeType(signatureType),
      imageWidth: sanitized.imageWidth,
      imageHeight: sanitized.imageHeight,
    });
    if (sanitized.buffer.length !== receiptBytes.length || sanitized.removedMetadataKinds.length > 0) {
      await fs.promises.writeFile(temporaryFilePath, sanitized.buffer);
    }

    const storedReceipt = await finalizeStoredCollectionReceiptFile({
      temporaryFilePath,
      fileName,
      signatureType,
    });

    return buildStoredCollectionReceiptFile({
      storedReceipt,
      inspection,
      fileSize: sanitized.buffer.length,
    });
  } catch (error) {
    if (error instanceof CollectionReceiptSecurityError) {
      await quarantineRejectedCollectionReceipt({
        source: "multipart",
        fileName,
        mimeType: receipt.mimeType,
        signatureType,
        rejectionError: error,
        filePath: temporaryFilePath,
      });
    }
    await fs.promises.rm(temporaryFilePath, { force: true }).catch((cleanupError) => {
      logCollectionReceiptBestEffortFailure(
        "Failed to remove staged multipart collection receipt after save failure",
        {
          fileName,
          temporaryFilePath,
          error: cleanupError,
        },
      );
    });
    throw error;
  }
}
export { removeCollectionReceiptFile, resolveCollectionReceiptFile };
