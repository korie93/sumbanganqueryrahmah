import fs from "fs";
import {
  resolveCollectionReceiptStoragePath,
} from "../lib/collection-receipt-files";
import {
  COLLECTION_RECEIPT_INLINE_MIME,
  resolveCollectionReceiptMimeTypeFromFileName,
} from "./collection-receipt-file-type-utils";
import { logCollectionReceiptBestEffortFailure } from "./collection-receipt-storage-utils";

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
