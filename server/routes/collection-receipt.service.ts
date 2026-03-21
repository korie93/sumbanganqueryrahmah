import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
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
const COLLECTION_RECEIPT_DIR = path.resolve(process.cwd(), "uploads", "collection-receipts");
const COLLECTION_RECEIPT_PUBLIC_PREFIX = "/uploads/collection-receipts";

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
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  return null;
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
  const mimeType = String(receipt.mimeType || "").trim().toLowerCase();
  if (mimeType && !COLLECTION_RECEIPT_ALLOWED_MIME.has(mimeType)) {
    throw new Error("Receipt file type is not allowed.");
  }

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

  const mimeTypeResolved = mimeType ? mapCollectionReceiptMimeToType(mimeType) : null;
  if (mimeType && !mimeTypeResolved) {
    throw new Error("Receipt file type is not allowed.");
  }
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
  const normalized = String(receiptPath || "").trim().replace(/\\/g, "/");
  if (!normalized.startsWith(`${COLLECTION_RECEIPT_PUBLIC_PREFIX}/`)) return;

  const fileName = normalized.slice(`${COLLECTION_RECEIPT_PUBLIC_PREFIX}/`.length);
  if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return;

  const absolutePath = path.resolve(COLLECTION_RECEIPT_DIR, fileName);
  if (!absolutePath.startsWith(COLLECTION_RECEIPT_DIR)) return;

  try {
    await fs.promises.unlink(absolutePath);
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

function resolveCollectionReceiptFile(
  receiptPath: string | null | undefined,
): {
  absolutePath: string;
  storedFileName: string;
  mimeType: string;
  isInlinePreviewSupported: boolean;
} | null {
  const normalized = String(receiptPath || "").trim().replace(/\\/g, "/");
  if (!normalized.startsWith(`${COLLECTION_RECEIPT_PUBLIC_PREFIX}/`)) return null;

  const storedFileName = normalized.slice(`${COLLECTION_RECEIPT_PUBLIC_PREFIX}/`.length);
  if (!storedFileName) return null;
  if (storedFileName.includes("..") || storedFileName.includes("/") || storedFileName.includes("\\")) return null;
  if (path.basename(storedFileName) !== storedFileName) return null;

  const absolutePath = path.resolve(COLLECTION_RECEIPT_DIR, storedFileName);
  const relativePath = path.relative(COLLECTION_RECEIPT_DIR, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;

  const mimeType = resolveCollectionReceiptMimeTypeFromFileName(storedFileName);
  return {
    absolutePath,
    storedFileName,
    mimeType,
    isInlinePreviewSupported: COLLECTION_RECEIPT_INLINE_MIME.has(mimeType),
  };
}

async function resolveSelectedReceipt(
  storage: PostgresStorage,
  recordId: string,
  receiptIdRaw?: string | null,
): Promise<CollectionRecordReceipt | null> {
  const receiptId = normalizeCollectionText(receiptIdRaw);
  if (receiptId) {
    return (await storage.getCollectionRecordReceiptById(recordId, receiptId)) || null;
  }

  const receipts = await storage.listCollectionRecordReceipts(recordId);
  return receipts[0] || null;
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
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }

    const id = normalizeCollectionText(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, message: "Collection id is required." });
    }

    const record = await storage.getCollectionRecordById(id);
    if (!record) {
      return res.status(404).json({ ok: false, message: "Collection record not found." });
    }

    const canAccessRecord = await canUserAccessCollectionRecord(storage, req.user, {
      createdByLogin: record.createdByLogin,
      collectionStaffNickname: record.collectionStaffNickname,
    });
    if (!canAccessRecord) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const selectedReceipt = await resolveSelectedReceipt(
      storage,
      id,
      receiptIdRaw ?? req.params.receiptId ?? null,
    );
    const legacyReceiptPath =
      !selectedReceipt && record.receiptFile ? record.receiptFile : null;
    const resolved = resolveCollectionReceiptFile(
      selectedReceipt?.storagePath ?? legacyReceiptPath,
    );

    if (!resolved) {
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }

    try {
      await fs.promises.access(resolved.absolutePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }

    const responseMimeType = selectedReceipt?.originalMimeType || resolved.mimeType;
    if (mode === "view" && !COLLECTION_RECEIPT_INLINE_MIME.has(responseMimeType)) {
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
      res.status(status).json({ ok: false, message });
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Failed to load receipt file." });
  }
}
