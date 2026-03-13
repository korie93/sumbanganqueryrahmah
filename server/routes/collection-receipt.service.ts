import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import type { PostgresStorage } from "../storage-postgres";
import { canUserAccessCollectionRecord } from "./collection-access";
import { normalizeCollectionText, type CollectionReceiptPayload } from "./collection.validation";

const COLLECTION_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const COLLECTION_RECEIPT_ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".pdf"]);
const COLLECTION_RECEIPT_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const COLLECTION_RECEIPT_INLINE_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);
const COLLECTION_RECEIPT_DIR = path.resolve(process.cwd(), "uploads", "collection-receipts");
const COLLECTION_RECEIPT_PUBLIC_PREFIX = "/uploads/collection-receipts";

function resolveReceiptExtension(receipt: CollectionReceiptPayload): string | null {
  const originalFileName = String(receipt.fileName || "").trim();
  const mimeType = String(receipt.mimeType || "").trim().toLowerCase();
  const extFromName = path.extname(originalFileName).toLowerCase();

  if (extFromName && COLLECTION_RECEIPT_ALLOWED_EXT.has(extFromName)) {
    return extFromName === ".jpeg" ? ".jpg" : extFromName;
  }

  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "application/pdf") return ".pdf";
  return null;
}

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

export async function saveCollectionReceipt(receipt: CollectionReceiptPayload): Promise<string> {
  const mimeType = String(receipt.mimeType || "").trim().toLowerCase();
  if (mimeType && !COLLECTION_RECEIPT_ALLOWED_MIME.has(mimeType)) {
    throw new Error("Receipt file type is not allowed.");
  }

  const extension = resolveReceiptExtension(receipt);
  if (!extension) {
    throw new Error("Receipt file extension is not allowed.");
  }

  const buffer = extractReceiptBuffer(receipt);
  if (!buffer) {
    throw new Error("Invalid receipt payload.");
  }

  if (buffer.length > COLLECTION_RECEIPT_MAX_BYTES) {
    throw new Error("Receipt file exceeds 5MB.");
  }

  await fs.promises.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });
  const originalFileName = String(receipt.fileName || "receipt").trim();
  const stem = path
    .basename(originalFileName, path.extname(originalFileName))
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 40) || "receipt";
  const storedFileName = `${Date.now()}-${randomUUID()}-${stem}${extension}`;
  const absolutePath = path.join(COLLECTION_RECEIPT_DIR, storedFileName);
  await fs.promises.writeFile(absolutePath, buffer);

  return `${COLLECTION_RECEIPT_PUBLIC_PREFIX}/${storedFileName}`.replace(/\\/g, "/");
}

export async function removeCollectionReceiptFile(receiptPath: string | null | undefined): Promise<void> {
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
  return "application/octet-stream";
}

function sanitizeReceiptDownloadName(fileName: string): string {
  const sanitized = String(fileName || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  return sanitized || "receipt";
}

function resolveCollectionReceiptFile(receiptPath: string | null | undefined): {
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

export async function serveCollectionReceipt(
  storage: PostgresStorage,
  req: AuthenticatedRequest,
  res: Response,
  mode: "view" | "download",
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

    if (!record.receiptFile) {
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }

    const resolved = resolveCollectionReceiptFile(record.receiptFile);
    if (!resolved) {
      return res.status(404).json({ ok: false, message: "Receipt file path is invalid." });
    }

    try {
      await fs.promises.access(resolved.absolutePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }

    if (mode === "view" && !resolved.isInlinePreviewSupported) {
      return res.status(415).json({ ok: false, message: "Preview not available for this file type." });
    }

    const safeFileName = sanitizeReceiptDownloadName(resolved.storedFileName);
    res.setHeader("Content-Type", resolved.mimeType);
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
