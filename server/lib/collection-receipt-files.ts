import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export const COLLECTION_UPLOADS_ROOT_DIR = path.resolve(process.cwd(), "uploads");
export const COLLECTION_RECEIPT_DIR = path.resolve(COLLECTION_UPLOADS_ROOT_DIR, "collection-receipts");
export const COLLECTION_RECEIPT_PUBLIC_PREFIX = "/uploads/collection-receipts";
const DEFAULT_COLLECTION_RECEIPT_QUARANTINE_DIR = path.resolve(
  process.cwd(),
  "var",
  "collection-receipt-quarantine",
);

function normalizeReceiptPath(receiptPath: string | null | undefined): string {
  return String(receiptPath || "").trim().replace(/\\/g, "/");
}

function stripUploadsPrefix(normalizedReceiptPath: string): string | null {
  if (normalizedReceiptPath.startsWith("/uploads/")) {
    return normalizedReceiptPath.slice("/uploads/".length);
  }
  if (normalizedReceiptPath.startsWith("uploads/")) {
    return normalizedReceiptPath.slice("uploads/".length);
  }
  return null;
}

export function resolveCollectionReceiptStoragePath(
  receiptPath: string | null | undefined,
): {
  absolutePath: string;
  relativePath: string;
  publicPath: string;
  storedFileName: string;
  isManagedCollectionReceipt: boolean;
} | null {
  const normalizedReceiptPath = normalizeReceiptPath(receiptPath);
  if (!normalizedReceiptPath) return null;

  const uploadsRelativePath = stripUploadsPrefix(normalizedReceiptPath)?.replace(/^\/+/, "") || "";
  if (!uploadsRelativePath) return null;

  const absolutePath = path.resolve(COLLECTION_UPLOADS_ROOT_DIR, uploadsRelativePath);
  const relativePath = path.relative(COLLECTION_UPLOADS_ROOT_DIR, absolutePath).replace(/\\/g, "/");
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return {
    absolutePath,
    relativePath,
    publicPath: `/uploads/${relativePath}`,
    storedFileName: path.basename(relativePath),
    isManagedCollectionReceipt: relativePath === "collection-receipts"
      || relativePath.startsWith("collection-receipts/"),
  };
}

export async function collectionReceiptFileExists(
  receiptPath: string | null | undefined,
): Promise<boolean> {
  const resolved = resolveCollectionReceiptStoragePath(receiptPath);
  if (!resolved) return false;

  try {
    await fs.access(resolved.absolutePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function isCollectionReceiptQuarantineEnabled(): boolean {
  return String(process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED || "1").trim() !== "0";
}

export function getCollectionReceiptQuarantineDir(): string {
  const configured = String(process.env.COLLECTION_RECEIPT_QUARANTINE_DIR || "").trim();
  if (!configured) {
    return DEFAULT_COLLECTION_RECEIPT_QUARANTINE_DIR;
  }

  return path.resolve(process.cwd(), configured);
}
