import fs from "fs";
import { createHash, randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  COLLECTION_RECEIPT_PUBLIC_PREFIX,
  resolveCollectionReceiptStoragePath,
} from "../lib/collection-receipt-files";
import {
  CollectionReceiptSecurityError,
  detectCollectionReceiptSignature,
  sanitizeCollectionReceiptBuffer,
  type CollectionReceiptFileType,
} from "../lib/collection-receipt-security";
import type { CreateCollectionRecordReceiptInput } from "../storage-postgres";
import type { CollectionReceiptPayload } from "./collection.validation";
import {
  buildStoredCollectionReceiptMetadata,
  COLLECTION_RECEIPT_ALLOWED_MIME,
  COLLECTION_RECEIPT_INLINE_MIME,
  COLLECTION_RECEIPT_MAX_BYTES,
  COLLECTION_RECEIPT_TYPE_CONFIG,
  isCollectionReceiptInlinePreviewMimeType,
  mapCollectionReceiptExtensionToType,
  mapCollectionReceiptMimeToType,
  normalizeCollectionReceiptMimeType,
  resolveCollectionReceiptMimeTypeFromFileName,
  sanitizeReceiptDownloadName,
} from "./collection-receipt-file-type-utils";
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

export type MultipartCollectionReceiptInput = {
  fileName?: string | null;
  mimeType?: string | null;
  stream: NodeJS.ReadableStream;
};

async function inspectCollectionReceiptBuffer(params: {
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

    const extFromName = String(receipt.fileName || "").trim();
    const extensionType = extFromName
      ? mapCollectionReceiptExtensionToType(extFromName.slice(extFromName.lastIndexOf(".")))
      : null;
    if (extFromName && extFromName.includes(".") && !extensionType) {
      throw new CollectionReceiptSecurityError(
        "Receipt file extension is not allowed.",
        "receipt-extension-not-allowed",
      );
    }
    if (extensionType && extensionType !== signatureType) {
      throw new CollectionReceiptSecurityError(
        "Receipt file content does not match file extension.",
        "receipt-extension-mismatch",
      );
    }

    const mimeTypeResolved = declaredMimeTypeAccepted
      ? mapCollectionReceiptMimeToType(declaredMimeType)
      : null;
    if (mimeTypeResolved && mimeTypeResolved !== signatureType) {
      throw new CollectionReceiptSecurityError(
        "Receipt file content does not match declared MIME type.",
        "receipt-mime-mismatch",
      );
    }

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
      mimeType: COLLECTION_RECEIPT_TYPE_CONFIG[signatureType].mimeType,
      imageWidth: sanitized.imageWidth,
      imageHeight: sanitized.imageHeight,
    });

    const persisted = await persistCollectionReceiptFile({
      fileName: String(receipt.fileName || "receipt"),
      signatureType,
      buffer: sanitized.buffer,
    });

    return {
      storagePath: persisted.storedReceipt.storagePath,
      originalFileName: persisted.storedReceipt.originalFileName,
      originalMimeType: persisted.storedReceipt.canonicalType.mimeType,
      originalExtension: persisted.storedReceipt.canonicalType.extension,
      fileSize: sanitized.buffer.length,
      fileHash: inspection.fileHash,
      extractedAmountCents: inspection.extractedAmountCents,
      extractionStatus: inspection.extractionStatus,
      extractionConfidence: inspection.extractionConfidence,
      extractionMessage: inspection.extractionMessage,
    };
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

    if (extensionType && extensionType !== signatureType) {
      throw new CollectionReceiptSecurityError(
        "Receipt file content does not match file extension.",
        "receipt-extension-mismatch",
      );
    }

    const mimeTypeResolved = declaredMimeTypeAccepted
      ? mapCollectionReceiptMimeToType(declaredMimeType)
      : null;
    if (mimeTypeResolved && mimeTypeResolved !== signatureType) {
      throw new CollectionReceiptSecurityError(
        "Receipt file content does not match declared MIME type.",
        "receipt-mime-mismatch",
      );
    }

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
      mimeType: COLLECTION_RECEIPT_TYPE_CONFIG[signatureType].mimeType,
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

    return {
      storagePath: storedReceipt.storagePath,
      originalFileName: storedReceipt.originalFileName,
      originalMimeType: storedReceipt.canonicalType.mimeType,
      originalExtension: storedReceipt.canonicalType.extension,
      fileSize: sanitized.buffer.length,
      fileHash: inspection.fileHash,
      extractedAmountCents: inspection.extractedAmountCents,
      extractionStatus: inspection.extractionStatus,
      extractionConfidence: inspection.extractionConfidence,
      extractionMessage: inspection.extractionMessage,
    };
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

export async function removeCollectionReceiptFile(
  receiptPath: string | null | undefined,
): Promise<void> {
  const resolved = resolveCollectionReceiptStoragePath(receiptPath);
  if (!resolved?.isManagedCollectionReceipt) return;

  try {
    await fs.promises.unlink(resolved.absolutePath);
  } catch (error) {
    logCollectionReceiptBestEffortFailure("Failed to remove managed collection receipt file", {
      receiptPath: resolved.relativePath,
      absolutePath: resolved.absolutePath,
      error,
    });
  }
}

export function resolveCollectionReceiptFile(
  receiptPath: string | null | undefined,
): {
  absolutePath: string;
  storedFileName: string;
  mimeType: string;
  isInlinePreviewSupported: boolean;
} | null {
  const resolvedStoragePath = resolveCollectionReceiptStoragePath(receiptPath);
  if (!resolvedStoragePath) return null;

  const mimeType = resolveCollectionReceiptMimeTypeFromFileName(
    resolvedStoragePath.storedFileName || resolvedStoragePath.relativePath,
  );
  return {
    absolutePath: resolvedStoragePath.absolutePath,
    storedFileName: resolvedStoragePath.storedFileName,
    mimeType,
    isInlinePreviewSupported: COLLECTION_RECEIPT_INLINE_MIME.has(mimeType),
  };
}
