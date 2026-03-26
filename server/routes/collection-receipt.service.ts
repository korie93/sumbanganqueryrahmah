import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import {
  COLLECTION_RECEIPT_DIR,
  COLLECTION_RECEIPT_PUBLIC_PREFIX,
  getCollectionReceiptQuarantineDir,
  isCollectionReceiptQuarantineEnabled,
  resolveCollectionReceiptStoragePath,
} from "../lib/collection-receipt-files";
import {
  CollectionReceiptSecurityError,
  detectCollectionReceiptSignature,
  type CollectionReceiptFileType,
  sanitizeCollectionReceiptBuffer,
} from "../lib/collection-receipt-security";
import { scanCollectionReceiptWithExternalScanner } from "../lib/collection-receipt-external-scan";
import { logger } from "../lib/logger";
import type {
  CollectionRecordReceipt,
  CreateCollectionRecordReceiptInput,
  PostgresStorage,
} from "../storage-postgres";
import { canUserAccessCollectionRecord } from "./collection-access";
import { normalizeCollectionText, type CollectionReceiptPayload } from "./collection.validation";

export { detectCollectionReceiptSignature } from "../lib/collection-receipt-security";

const COLLECTION_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const COLLECTION_RECEIPT_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf", "image/webp"]);
const COLLECTION_RECEIPT_INLINE_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const COLLECTION_RECEIPT_MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/jfif": "image/jpeg",
  "image/jpe": "image/jpeg",
  "image/x-png": "image/png",
  "application/x-pdf": "application/pdf",
};

const COLLECTION_RECEIPT_TYPE_CONFIG: Record<CollectionReceiptFileType, { extension: string; mimeType: string }> = {
  pdf: { extension: ".pdf", mimeType: "application/pdf" },
  png: { extension: ".png", mimeType: "image/png" },
  jpg: { extension: ".jpg", mimeType: "image/jpeg" },
  webp: { extension: ".webp", mimeType: "image/webp" },
};

function mapCollectionReceiptExtensionToType(extension: string): CollectionReceiptFileType | null {
  const normalized = String(extension || "").trim().toLowerCase();
  if (normalized === ".pdf") return "pdf";
  if (normalized === ".png") return "png";
  if (normalized === ".jpg" || normalized === ".jpeg") return "jpg";
  if (normalized === ".webp") return "webp";
  return null;
}

function mapCollectionReceiptMimeToType(mimeType: string): CollectionReceiptFileType | null {
  const normalized = normalizeCollectionReceiptMimeType(mimeType);
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  return null;
}

function normalizeCollectionReceiptMimeType(mimeType: string): string {
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (!normalized) return "";
  return COLLECTION_RECEIPT_MIME_ALIASES[normalized] || normalized;
}

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
type QuarantineCollectionReceiptInput = {
  source: "base64" | "multipart";
  fileName?: string | null;
  mimeType?: string | null;
  signatureType?: CollectionReceiptFileType | null;
  rejectionError: CollectionReceiptSecurityError;
  buffer?: Buffer | null;
  filePath?: string | null;
};

function extractReceiptBuffer(receipt: CollectionReceiptPayload): Buffer | null {
  const rawBase64 = String(receipt.contentBase64 || "").trim();
  if (!rawBase64) return null;
  const sanitized = rawBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!sanitized) return null;

  try {
    const buffer = Buffer.from(sanitized, "base64");
    if (!buffer.length) return null;
    return buffer;
  } catch {
    return null;
  }
}

function sanitizeOriginalFileName(fileName: string, fallbackExtension: string): string {
  const raw = String(fileName || "").trim();
  const ext = path.extname(raw).toLowerCase();
  const stem = path
    .basename(raw, ext)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80) || "receipt";
  const safeExtension = ext || fallbackExtension || "";
  return `${stem}${safeExtension}`.slice(0, 140);
}

async function quarantineRejectedCollectionReceipt(
  params: QuarantineCollectionReceiptInput,
): Promise<void> {
  if (!isCollectionReceiptQuarantineEnabled()) {
    return;
  }

  let payloadBuffer = params.buffer || null;
  if (!payloadBuffer && params.filePath) {
    try {
      payloadBuffer = await fs.promises.readFile(params.filePath);
    } catch {
      payloadBuffer = null;
    }
  }

  if (!payloadBuffer?.length || payloadBuffer.length > COLLECTION_RECEIPT_MAX_BYTES) {
    return;
  }

  try {
    const quarantineDir = getCollectionReceiptQuarantineDir();
    await fs.promises.mkdir(quarantineDir, { recursive: true });

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

function buildStoredCollectionReceiptMetadata(params: {
  fileName: string;
  signatureType: CollectionReceiptFileType;
}) {
  const canonicalType = COLLECTION_RECEIPT_TYPE_CONFIG[params.signatureType];
  const originalFileName = sanitizeOriginalFileName(
    String(params.fileName || "receipt"),
    canonicalType.extension,
  );
  const stem = path
    .basename(originalFileName, path.extname(originalFileName))
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 40) || "receipt";
  const storedFileName = `${Date.now()}-${randomUUID()}-${stem}${canonicalType.extension}`;

  return {
    canonicalType,
    originalFileName,
    storedFileName,
    absolutePath: path.join(COLLECTION_RECEIPT_DIR, storedFileName),
    storagePath: `${COLLECTION_RECEIPT_PUBLIC_PREFIX}/${storedFileName}`.replace(/\\/g, "/"),
  };
}

function buildReceiptLogFingerprint(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

function logCollectionReceiptSanitization(params: {
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

    const extFromName = path.extname(String(receipt.fileName || "").trim()).toLowerCase();
    const extensionType = extFromName ? mapCollectionReceiptExtensionToType(extFromName) : null;
    if (extFromName && !extensionType) {
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
      await fs.promises.rm(stagedFilePath, { force: true }).catch(() => undefined);
    }
    throw error;
  }
}

async function persistCollectionReceiptFile(params: {
  fileName: string;
  signatureType: CollectionReceiptFileType;
  buffer: Buffer;
}): Promise<{
  storedReceipt: ReturnType<typeof buildStoredCollectionReceiptMetadata>;
  temporaryFilePath: string;
}> {
  await fs.promises.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });

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

export async function saveMultipartCollectionReceipt(
  receipt: MultipartCollectionReceiptInput,
): Promise<StoredCollectionReceiptFile> {
  const fileName = String(receipt.fileName || "receipt").trim();
  const declaredMimeType = normalizeCollectionReceiptMimeType(receipt.mimeType || "");
  const declaredMimeTypeAccepted = COLLECTION_RECEIPT_ALLOWED_MIME.has(declaredMimeType);

  const extFromName = path.extname(fileName).toLowerCase();
  const extensionType = extFromName ? mapCollectionReceiptExtensionToType(extFromName) : null;
  if (extFromName && !extensionType) {
    throw new Error("Receipt file extension is not allowed.");
  }

  await fs.promises.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });

  const temporaryFileName = `${Date.now()}-${randomUUID()}.upload`;
  const temporaryFilePath = path.join(COLLECTION_RECEIPT_DIR, temporaryFileName);
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

    await scanCollectionReceiptWithExternalScanner(temporaryFilePath);

    const storedReceipt = buildStoredCollectionReceiptMetadata({
      fileName,
      signatureType,
    });
    await fs.promises.rename(temporaryFilePath, storedReceipt.absolutePath);

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
    await fs.promises.rm(temporaryFilePath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function inspectMultipartCollectionReceipt(
  receipt: MultipartCollectionReceiptInput,
): Promise<CollectionReceiptInspectionResult & {
  fileName: string;
}> {
  const fileName = String(receipt.fileName || "receipt").trim();
  const declaredMimeType = normalizeCollectionReceiptMimeType(receipt.mimeType || "");
  const declaredMimeTypeAccepted = COLLECTION_RECEIPT_ALLOWED_MIME.has(declaredMimeType);

  const extFromName = path.extname(fileName).toLowerCase();
  const extensionType = extFromName ? mapCollectionReceiptExtensionToType(extFromName) : null;
  if (extFromName && !extensionType) {
    throw new Error("Receipt file extension is not allowed.");
  }

  await fs.promises.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });

  const temporaryFileName = `${Date.now()}-${randomUUID()}.inspect`;
  const temporaryFilePath = path.join(COLLECTION_RECEIPT_DIR, temporaryFileName);
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
    if (sanitized.buffer.length !== receiptBytes.length || sanitized.removedMetadataKinds.length > 0) {
      await fs.promises.writeFile(temporaryFilePath, sanitized.buffer);
    }

    await scanCollectionReceiptWithExternalScanner(temporaryFilePath);
    const inspection = await inspectCollectionReceiptBuffer({
      buffer: sanitized.buffer,
      mimeType: COLLECTION_RECEIPT_TYPE_CONFIG[signatureType].mimeType,
      imageWidth: sanitized.imageWidth,
      imageHeight: sanitized.imageHeight,
    });

    return {
      fileName,
      ...inspection,
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
    throw error;
  } finally {
    await fs.promises.rm(temporaryFilePath, { force: true }).catch(() => undefined);
  }
}

export async function removeCollectionReceiptFile(
  receiptPath: string | null | undefined,
): Promise<void> {
  const resolved = resolveCollectionReceiptStoragePath(receiptPath);
  if (!resolved?.isManagedCollectionReceipt) return;

  try {
    await fs.promises.unlink(resolved.absolutePath);
  } catch {
    // best effort only
  }
}

function resolveCollectionReceiptMimeTypeFromFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

function sanitizeReceiptDownloadName(fileName: string): string {
  const sanitized = String(fileName || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  return sanitized || "receipt";
}

function isCollectionReceiptInlinePreviewMimeType(mimeType: string): boolean {
  const normalized = normalizeCollectionReceiptMimeType(mimeType);
  if (!normalized) return false;
  if (COLLECTION_RECEIPT_INLINE_MIME.has(normalized)) return true;
  return normalized.startsWith("image/");
}

function resolveCollectionReceiptFile(
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

function logCollectionReceiptWarning(
  req: AuthenticatedRequest,
  mode: "view" | "download",
  statusCode: number,
  reason: string,
  meta?: Record<string, unknown>,
) {
  logger.warn("Collection receipt request failed", {
    mode,
    statusCode,
    reason,
    username: req.user?.username || null,
    recordId: req.params.id || null,
    receiptId: req.params.receiptId || null,
    ...meta,
  });
}

async function resolveSelectedReceipt(
  storage: PostgresStorage,
  record: {
    id: string;
    receiptFile?: string | null;
    receipts?: CollectionRecordReceipt[] | null;
    createdAt?: Date | string | null;
  },
  receiptIdRaw?: string | null,
): Promise<CollectionRecordReceipt | null> {
  const recordId = normalizeCollectionText(record.id);
  if (!recordId) return null;
  const receiptId = normalizeCollectionText(receiptIdRaw);
  const hydratedReceipts = Array.isArray(record.receipts) ? record.receipts : [];

  if (receiptId) {
    const hydratedMatch = hydratedReceipts.find((receipt) => normalizeCollectionText(receipt.id) === receiptId);
    if (hydratedMatch) {
      return hydratedMatch;
    }
    return (await storage.getCollectionRecordReceiptById(recordId, receiptId)) || null;
  }

  if (hydratedReceipts[0]) {
    return hydratedReceipts[0];
  }

  const receipts = await storage.listCollectionRecordReceipts(recordId);
  if (receipts[0]) {
    return receipts[0];
  }

  // Transitional compatibility bridge:
  // promote legacy collection_records.receipt_file into collection_record_receipts when possible.
  const legacyPath = normalizeCollectionText(record.receiptFile);
  if (!legacyPath) {
    return null;
  }

  const resolvedLegacyFile = resolveCollectionReceiptFile(legacyPath);
  if (!resolvedLegacyFile) {
    return null;
  }

  const compatibilityCreatedAt =
    record.createdAt instanceof Date
      ? record.createdAt
      : record.createdAt
        ? new Date(record.createdAt)
        : new Date();
  const safeCreatedAt = Number.isFinite(compatibilityCreatedAt.getTime())
    ? compatibilityCreatedAt
    : new Date();
  const fallbackFileName = path.basename(resolvedLegacyFile.storedFileName) || "receipt";
  const fallbackExtension = path.extname(fallbackFileName).toLowerCase() || "";
  let fallbackFileSize = 0;
  try {
    const stats = await fs.promises.stat(resolvedLegacyFile.absolutePath);
    fallbackFileSize = Number.isFinite(stats.size) ? stats.size : 0;
  } catch {
    fallbackFileSize = 0;
  }

  try {
    await storage.createCollectionRecordReceipts(recordId, [
      {
        storagePath: legacyPath,
        originalFileName: fallbackFileName,
        originalMimeType: resolvedLegacyFile.mimeType,
        originalExtension: fallbackExtension,
        fileSize: fallbackFileSize,
      },
    ]);
    const refreshedReceipts = await storage.listCollectionRecordReceipts(recordId);
    if (refreshedReceipts[0]) {
      return refreshedReceipts[0];
    }
  } catch {
    // Compatibility-only fallback: do not block preview/download if auto-promotion fails.
  }

  return {
    id: `legacy-${recordId}`,
    collectionRecordId: recordId,
    storagePath: legacyPath,
    originalFileName: fallbackFileName,
    originalMimeType: resolvedLegacyFile.mimeType,
    originalExtension: fallbackExtension,
    fileSize: fallbackFileSize,
    receiptAmount: null,
    extractedAmount: null,
    extractionStatus: "unprocessed",
    extractionConfidence: null,
    receiptDate: null,
    receiptReference: null,
    fileHash: null,
    createdAt: safeCreatedAt,
  };
}

async function pruneMissingRelationReceipt(
  storage: PostgresStorage,
  recordId: string,
  receipt: CollectionRecordReceipt | null,
): Promise<void> {
  const normalizedReceiptId = normalizeCollectionText(receipt?.id);
  if (!normalizedReceiptId || normalizedReceiptId.startsWith("legacy-")) {
    return;
  }

  try {
    await storage.deleteCollectionRecordReceipts(recordId, [normalizedReceiptId]);
  } catch {
    // best effort cleanup only
  }
}

export async function serveCollectionReceipt(
  storage: PostgresStorage,
  req: AuthenticatedRequest,
  res: Response,
  mode: "view" | "download",
  receiptIdRaw?: string | null,
) {
  try {
    if (!req.user) {
      logCollectionReceiptWarning(req, mode, 401, "unauthenticated");
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }

    const id = normalizeCollectionText(req.params.id);
    if (!id) {
      logCollectionReceiptWarning(req, mode, 400, "missing_collection_id");
      return res.status(400).json({ ok: false, message: "Collection id is required." });
    }

    const record = await storage.getCollectionRecordById(id);
    if (!record) {
      logCollectionReceiptWarning(req, mode, 404, "record_not_found", { recordId: id });
      return res.status(404).json({ ok: false, message: "Collection record not found." });
    }

    const canAccessRecord = await canUserAccessCollectionRecord(storage, req.user, {
      createdByLogin: record.createdByLogin,
      collectionStaffNickname: record.collectionStaffNickname,
    });
    if (!canAccessRecord) {
      logCollectionReceiptWarning(req, mode, 403, "forbidden", { recordId: record.id });
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const requestedReceiptId = normalizeCollectionText(
      receiptIdRaw ?? req.params.receiptId ?? null,
    );
    let selectedReceipt = await resolveSelectedReceipt(
      storage,
      record,
      requestedReceiptId,
    );
    if (requestedReceiptId && !selectedReceipt) {
      logCollectionReceiptWarning(req, mode, 404, "receipt_row_not_found", {
        recordId: record.id,
        requestedReceiptId,
      });
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }
    let resolved = resolveCollectionReceiptFile(selectedReceipt?.storagePath ?? null);
    if (!resolved && selectedReceipt) {
      await pruneMissingRelationReceipt(storage, record.id, selectedReceipt);
      if (!requestedReceiptId) {
        const refreshedRecord = await storage.getCollectionRecordById(record.id);
        const fallbackReceipt = await resolveSelectedReceipt(storage, refreshedRecord || record, null);
        resolved = resolveCollectionReceiptFile(fallbackReceipt?.storagePath ?? null);
        if (resolved) {
          selectedReceipt = fallbackReceipt;
        }
      }
    }

    if (resolved) {
      try {
        await fs.promises.access(resolved.absolutePath, fs.constants.R_OK);
      } catch {
        await pruneMissingRelationReceipt(storage, record.id, selectedReceipt);
        resolved = null;
        if (!requestedReceiptId) {
          const refreshedRecord = await storage.getCollectionRecordById(record.id);
          const fallbackReceipt = await resolveSelectedReceipt(storage, refreshedRecord || record, null);
          const fallbackResolved = resolveCollectionReceiptFile(fallbackReceipt?.storagePath ?? null);
          if (fallbackResolved) {
            resolved = fallbackResolved;
            selectedReceipt = fallbackReceipt;
          }
        }
      }
    }

    if (!resolved) {
      logCollectionReceiptWarning(req, mode, 404, "receipt_storage_missing", {
        recordId: record.id,
        requestedReceiptId,
      });
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }

    const responseMimeType =
      normalizeCollectionReceiptMimeType(selectedReceipt?.originalMimeType || resolved.mimeType)
      || resolved.mimeType;
    if (mode === "view" && !isCollectionReceiptInlinePreviewMimeType(responseMimeType)) {
      logCollectionReceiptWarning(req, mode, 415, "preview_not_supported", {
        recordId: record.id,
        requestedReceiptId,
        mimeType: responseMimeType,
      });
      return res.status(415).json({ ok: false, message: "Preview not available for this file type." });
    }

    const safeFileName = sanitizeReceiptDownloadName(
      selectedReceipt?.originalFileName || resolved.storedFileName,
    );
    res.setHeader("Content-Type", responseMimeType);
    res.setHeader(
      "Content-Disposition",
      `${mode === "download" ? "attachment" : "inline"}; filename="${safeFileName}"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

    return res.sendFile(resolved.absolutePath, (err) => {
      if (!err || res.headersSent) return;
      const sendErr = err as NodeJS.ErrnoException;
      const status = sendErr.code === "ENOENT" ? 404 : 500;
      const message = status === 404 ? "Receipt file not found." : "Failed to serve receipt file.";
      logCollectionReceiptWarning(req, mode, status, status === 404 ? "send_file_missing" : "send_file_failed", {
        recordId: record.id,
        requestedReceiptId,
        errorCode: sendErr.code || null,
      });
      res.status(status).json({ ok: false, message });
    });
  } catch (err: any) {
    logger.error("Collection receipt request crashed", {
      mode,
      username: req.user?.username || null,
      recordId: req.params.id || null,
      receiptId: req.params.receiptId || null,
      error: err,
    });
    return res.status(500).json({ ok: false, message: err?.message || "Failed to load receipt file." });
  }
}
