import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { logger } from "../lib/logger";

const MAX_RECEIPT_RESPONSE_FILENAME_LENGTH = 255;
const RECEIPT_DOWNLOAD_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function sanitizeReceiptResponseFileName(fileName: string): string {
  const sanitized = String(fileName || "")
    .replace(/[^\w.-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/_+/g, "_")
    .slice(0, MAX_RECEIPT_RESPONSE_FILENAME_LENGTH);

  return sanitized || "receipt";
}

export function logCollectionReceiptWarning(params: {
  req: AuthenticatedRequest;
  mode: "view" | "download";
  statusCode: number;
  reason: string;
  meta?: Record<string, unknown> | undefined;
}): void {
  logger.warn("Collection receipt request failed", {
    mode: params.mode,
    statusCode: params.statusCode,
    reason: params.reason,
    username: params.req.user?.username || null,
    recordId: params.req.params.id || null,
    receiptId: params.req.params.receiptId || null,
    ...params.meta,
  });
}

export function applyCollectionReceiptResponseHeaders(params: {
  res: Response;
  mode: "view" | "download";
  mimeType: string;
  safeFileName: string;
}): void {
  const safeFileName = sanitizeReceiptResponseFileName(params.safeFileName);

  params.res.setHeader("Content-Type", params.mimeType);
  params.res.setHeader(
    "Content-Disposition",
    `${params.mode === "download" ? "attachment" : "inline"}; filename="${safeFileName}"`,
  );
  params.res.setHeader("X-Content-Type-Options", "nosniff");
  params.res.setHeader("X-Frame-Options", "DENY");
  params.res.setHeader("Content-Security-Policy", RECEIPT_DOWNLOAD_CSP);
  params.res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  params.res.setHeader("Pragma", "no-cache");
  params.res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}
