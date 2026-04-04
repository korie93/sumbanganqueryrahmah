import path from "path";
import { randomUUID } from "node:crypto";
import {
  COLLECTION_RECEIPT_DIR,
  COLLECTION_RECEIPT_PUBLIC_PREFIX,
} from "../lib/collection-receipt-files";
import type { CollectionReceiptFileType } from "../lib/collection-receipt-security";

export const COLLECTION_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const COLLECTION_RECEIPT_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "image/webp",
]);
export const COLLECTION_RECEIPT_INLINE_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const COLLECTION_RECEIPT_MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/jfif": "image/jpeg",
  "image/jpe": "image/jpeg",
  "image/x-png": "image/png",
  "application/x-pdf": "application/pdf",
};

export const COLLECTION_RECEIPT_TYPE_CONFIG: Record<
  CollectionReceiptFileType,
  { extension: string; mimeType: string }
> = {
  pdf: { extension: ".pdf", mimeType: "application/pdf" },
  png: { extension: ".png", mimeType: "image/png" },
  jpg: { extension: ".jpg", mimeType: "image/jpeg" },
  webp: { extension: ".webp", mimeType: "image/webp" },
};

export function mapCollectionReceiptExtensionToType(
  extension: string,
): CollectionReceiptFileType | null {
  const normalized = String(extension || "").trim().toLowerCase();
  if (normalized === ".pdf") return "pdf";
  if (normalized === ".png") return "png";
  if (normalized === ".jpg" || normalized === ".jpeg") return "jpg";
  if (normalized === ".webp") return "webp";
  return null;
}

export function normalizeCollectionReceiptMimeType(mimeType: string): string {
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (!normalized) return "";
  return COLLECTION_RECEIPT_MIME_ALIASES[normalized] || normalized;
}

export function mapCollectionReceiptMimeToType(
  mimeType: string,
): CollectionReceiptFileType | null {
  const normalized = normalizeCollectionReceiptMimeType(mimeType);
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  return null;
}

export function sanitizeOriginalFileName(
  fileName: string,
  fallbackExtension: string,
): string {
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

export function buildStoredCollectionReceiptMetadata(params: {
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

export function resolveCollectionReceiptMimeTypeFromFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

export function sanitizeReceiptDownloadName(fileName: string): string {
  const sanitized = String(fileName || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  return sanitized || "receipt";
}

export function isCollectionReceiptInlinePreviewMimeType(mimeType: string): boolean {
  const normalized = normalizeCollectionReceiptMimeType(mimeType);
  if (!normalized) return false;
  if (COLLECTION_RECEIPT_INLINE_MIME.has(normalized)) return true;
  return normalized.startsWith("image/");
}
