import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "node:crypto";
import {
  COLLECTION_RECEIPT_DIR,
  getCollectionReceiptQuarantineDir,
  isCollectionReceiptQuarantineEnabled,
} from "../lib/collection-receipt-files";
import {
  CollectionReceiptSecurityError,
  type CollectionReceiptFileType,
} from "../lib/collection-receipt-security";
import { scanCollectionReceiptWithExternalScanner } from "../lib/collection-receipt-external-scan";
import { logger } from "../lib/logger";
import type { CollectionReceiptPayload } from "./collection.validation";
import {
  buildStoredCollectionReceiptMetadata,
  COLLECTION_RECEIPT_MAX_BYTES,
  COLLECTION_RECEIPT_TYPE_CONFIG,
  normalizeCollectionReceiptMimeType,
  sanitizeOriginalFileName,
} from "./collection-receipt-file-type-utils";

type QuarantineCollectionReceiptInput = {
  source: "base64" | "multipart";
  fileName?: string | null | undefined;
  mimeType?: string | null | undefined;
  signatureType?: CollectionReceiptFileType | null | undefined;
  rejectionError: CollectionReceiptSecurityError;
  buffer?: Buffer | null | undefined;
  filePath?: string | null | undefined;
};

const PRIVATE_UPLOAD_DIRECTORY_MODE = 0o750;

export function logCollectionReceiptBestEffortFailure(
  message: string,
  meta?: Record<string, unknown>,
) {
  logger.warn(message, meta);
}

async function ensurePrivateUploadDirectory(directoryPath: string): Promise<void> {
  await fs.promises.mkdir(directoryPath, {
    recursive: true,
    mode: PRIVATE_UPLOAD_DIRECTORY_MODE,
  });

  if (process.platform === "win32") {
    return;
  }

  try {
    await fs.promises.chmod(directoryPath, PRIVATE_UPLOAD_DIRECTORY_MODE);
  } catch (error) {
    logCollectionReceiptBestEffortFailure("Failed to enforce private upload directory permissions", {
      directoryPath,
      mode: "750",
      error,
    });
  }
}

export function extractReceiptBuffer(receipt: CollectionReceiptPayload): Buffer | null {
  const rawBase64 = String(receipt.contentBase64 || "").trim();
  if (!rawBase64) return null;
  const sanitized = rawBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!sanitized) return null;

  try {
    const buffer = Buffer.from(sanitized, "base64");
    if (!buffer.length) return null;
    return buffer;
  } catch (error) {
    logCollectionReceiptBestEffortFailure("Collection receipt base64 decode failed", {
      fileName: receipt.fileName || null,
      declaredMimeType: normalizeCollectionReceiptMimeType(receipt.mimeType || ""),
      base64Length: sanitized.length,
      error,
    });
    return null;
  }
}

function buildReceiptLogFingerprint(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

export function logCollectionReceiptSanitization(params: {
  fileName: string;
  signatureType: CollectionReceiptFileType;
  sanitizedBuffer: Buffer;
  originalBytes: number;
  removedMetadataKinds: string[];
  imageWidth?: number;
  imageHeight?: number;
}) {
  if (!params.removedMetadataKinds.length) {
    return;
  }

  logger.info("Collection receipt metadata stripped before storage", {
    fileName: params.fileName,
    signatureType: params.signatureType,
    originalBytes: params.originalBytes,
    sanitizedBytes: params.sanitizedBuffer.length,
    removedMetadataKinds: params.removedMetadataKinds,
    imageWidth: params.imageWidth,
    imageHeight: params.imageHeight,
    sha256Prefix: buildReceiptLogFingerprint(params.sanitizedBuffer),
  });
}

export async function quarantineRejectedCollectionReceipt(
  params: QuarantineCollectionReceiptInput,
): Promise<void> {
  if (!isCollectionReceiptQuarantineEnabled()) {
    return;
  }

  let payloadBuffer = params.buffer || null;
  if (!payloadBuffer && params.filePath) {
    try {
      payloadBuffer = await fs.promises.readFile(params.filePath);
    } catch (error) {
      logCollectionReceiptBestEffortFailure("Failed to read rejected collection receipt for quarantine", {
        source: params.source,
        fileName: params.fileName || null,
        filePath: params.filePath,
        reasonCode: params.rejectionError.reasonCode,
        error,
      });
      payloadBuffer = null;
    }
  }

  if (!payloadBuffer?.length || payloadBuffer.length > COLLECTION_RECEIPT_MAX_BYTES) {
    return;
  }

  try {
    const quarantineDir = getCollectionReceiptQuarantineDir();
    await ensurePrivateUploadDirectory(quarantineDir);

    const quarantineId = `${Date.now()}-${randomUUID()}`;
    const fallbackExtension = params.signatureType
      ? COLLECTION_RECEIPT_TYPE_CONFIG[params.signatureType].extension
      : path.extname(String(params.fileName || "").trim()) || ".bin";
    const originalFileName = sanitizeOriginalFileName(
      String(params.fileName || "receipt"),
      fallbackExtension,
    );
    const storedExtension = path.extname(originalFileName) || fallbackExtension || ".bin";
    const payloadFileName = `${quarantineId}${storedExtension}`;
    const metadataFileName = `${quarantineId}.json`;
    const payloadPath = path.join(quarantineDir, payloadFileName);
    const metadataPath = path.join(quarantineDir, metadataFileName);

    await fs.promises.writeFile(payloadPath, payloadBuffer);
    await fs.promises.writeFile(metadataPath, JSON.stringify({
      quarantineId,
      quarantinedAt: new Date().toISOString(),
      source: params.source,
      originalFileName,
      declaredMimeType: normalizeCollectionReceiptMimeType(params.mimeType || ""),
      signatureType: params.signatureType || null,
      fileSize: payloadBuffer.length,
      sha256: createHash("sha256").update(payloadBuffer).digest("hex"),
      reason: params.rejectionError.message,
      reasonCode: params.rejectionError.reasonCode,
      payloadFileName,
      metadataFileName,
    }, null, 2), "utf8");

    logger.warn("Collection receipt quarantined after security rejection", {
      quarantineId,
      source: params.source,
      fileName: originalFileName,
      signatureType: params.signatureType || null,
      bytes: payloadBuffer.length,
      reasonCode: params.rejectionError.reasonCode,
      quarantineDir,
      sha256Prefix: buildReceiptLogFingerprint(payloadBuffer),
    });
  } catch (error) {
    logger.error("Failed to quarantine rejected collection receipt", {
      source: params.source,
      fileName: params.fileName || null,
      reasonCode: params.rejectionError.reasonCode,
      error,
    });
  }
}

export async function persistCollectionReceiptFile(params: {
  fileName: string;
  signatureType: CollectionReceiptFileType;
  buffer: Buffer;
}): Promise<{
  storedReceipt: ReturnType<typeof buildStoredCollectionReceiptMetadata>;
  temporaryFilePath: string;
}> {
  await ensurePrivateUploadDirectory(COLLECTION_RECEIPT_DIR);

  const storedReceipt = buildStoredCollectionReceiptMetadata({
    fileName: params.fileName,
    signatureType: params.signatureType,
  });
  const temporaryFilePath = path.join(COLLECTION_RECEIPT_DIR, `${Date.now()}-${randomUUID()}.scan`);
  await fs.promises.writeFile(temporaryFilePath, params.buffer, { flag: "wx" });
  try {
    await scanCollectionReceiptWithExternalScanner(temporaryFilePath);
    await fs.promises.rename(temporaryFilePath, storedReceipt.absolutePath);
  } catch (error) {
    const enriched = error as Error & { receiptTemporaryFilePath?: string };
    enriched.receiptTemporaryFilePath = temporaryFilePath;
    throw enriched;
  }

  return {
    storedReceipt,
    temporaryFilePath,
  };
}

export async function finalizeStoredCollectionReceiptFile(params: {
  temporaryFilePath: string;
  fileName: string;
  signatureType: CollectionReceiptFileType;
}): Promise<ReturnType<typeof buildStoredCollectionReceiptMetadata>> {
  const storedReceipt = buildStoredCollectionReceiptMetadata({
    fileName: params.fileName,
    signatureType: params.signatureType,
  });
  await scanCollectionReceiptWithExternalScanner(params.temporaryFilePath);
  await fs.promises.rename(params.temporaryFilePath, storedReceipt.absolutePath);
  return storedReceipt;
}
