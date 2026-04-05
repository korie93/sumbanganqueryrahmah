import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { logger } from "../lib/logger";

export function logCollectionReceiptWarning(params: {
  req: AuthenticatedRequest;
  mode: "view" | "download";
  statusCode: number;
  reason: string;
  meta?: Record<string, unknown>;
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
  params.res.setHeader("Content-Type", params.mimeType);
  params.res.setHeader(
    "Content-Disposition",
    `${params.mode === "download" ? "attachment" : "inline"}; filename="${params.safeFileName}"`,
  );
  params.res.setHeader("X-Content-Type-Options", "nosniff");
  params.res.setHeader("Cache-Control", "private, no-store, max-age=0");
  params.res.setHeader("Pragma", "no-cache");
  params.res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}
