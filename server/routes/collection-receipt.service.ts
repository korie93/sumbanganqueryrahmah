import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import {
  COLLECTION_RECEIPT_DIR,
  COLLECTION_RECEIPT_PUBLIC_PREFIX,
  resolveCollectionReceiptStoragePath,
} from "../lib/collection-receipt-files";
import { logger } from "../lib/logger";
import type {
  CollectionRecordReceipt,
  CreateCollectionRecordReceiptInput,
  PostgresStorage,
} from "../storage-postgres";
import { canUserAccessCollectionRecord } from "./collection-access";
import { normalizeCollectionText, type CollectionReceiptPayload } from "./collection.validation";

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
type CollectionReceiptFileType = "pdf" | "png" | "jpg" | "webp";

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

export function detectCollectionReceiptSignature(
  buffer: Buffer,
): CollectionReceiptFileType | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  if (
    buffer.length >= 5
    && buffer[0] === 0x25
    && buffer[1] === 0x50
    && buffer[2] === 0x44
    && buffer[3] === 0x46
    && buffer[4] === 0x2d
  ) {
    return "pdf";
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return "jpg";
  }

  if (
    buffer.length >= 12
    && buffer[0] === 0x52
    && buffer[1] === 0x49
    && buffer[2] === 0x46
    && buffer[3] === 0x46
    && buffer[8] === 0x57
    && buffer[9] === 0x45
    && buffer[10] === 0x42
    && buffer[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

export type StoredCollectionReceiptFile = CreateCollectionRecordReceiptInput;

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

  const signatureType = detectCollectionReceiptSignature(buffer);
  if (!signatureType) {
    throw new Error("Receipt file signature is not allowed.");
  }

  const extFromName = path.extname(String(receipt.fileName || "").trim()).toLowerCase();
  const extensionType = extFromName ? mapCollectionReceiptExtensionToType(extFromName) : null;
  if (extFromName && !extensionType) {
    throw new Error("Receipt file extension is not allowed.");
  }
  if (extensionType && extensionType !== signatureType) {
    throw new Error("Receipt file content does not match file extension.");
  }

  const mimeTypeResolved = declaredMimeTypeAccepted
    ? mapCollectionReceiptMimeToType(declaredMimeType)
    : null;
  if (mimeTypeResolved && mimeTypeResolved !== signatureType) {
    throw new Error("Receipt file content does not match declared MIME type.");
  }

  await fs.promises.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });

  const canonicalType = COLLECTION_RECEIPT_TYPE_CONFIG[signatureType];

  const originalFileName = sanitizeOriginalFileName(
    String(receipt.fileName || "receipt"),
    canonicalType.extension,
  );
  const stem = path
    .basename(originalFileName, path.extname(originalFileName))
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 40) || "receipt";
  const storedFileName = `${Date.now()}-${randomUUID()}-${stem}${canonicalType.extension}`;
  const absolutePath = path.join(COLLECTION_RECEIPT_DIR, storedFileName);
  await fs.promises.writeFile(absolutePath, buffer);

  return {
    storagePath: `${COLLECTION_RECEIPT_PUBLIC_PREFIX}/${storedFileName}`.replace(/\\/g, "/"),
    originalFileName,
    originalMimeType: canonicalType.mimeType,
    originalExtension: canonicalType.extension,
    fileSize: buffer.length,
  };
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
        const fallbackReceipt = await resolveSelectedReceipt(storage, record, null);
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
          const fallbackReceipt = await resolveSelectedReceipt(storage, record, null);
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
