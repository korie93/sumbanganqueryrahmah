import compression from "compression";
import type express from "express";
import type { Express } from "express";

export const HTTP_COMPRESSION_LEVEL = 6;
export const API_COMPRESSION_THRESHOLD_BYTES = 1024;

export function isCompressibleApiContentType(contentType: string | number | string[] | undefined) {
  const normalized = Array.isArray(contentType)
    ? contentType.join(";").toLowerCase()
    : String(contentType ?? "").toLowerCase();

  return /\btext\//.test(normalized)
    || /\bapplication\/(?:json|javascript|xml)\b/.test(normalized)
    || /\bapplication\/[\w.+-]+\+(?:json|xml)\b/.test(normalized)
    || /\bimage\/svg\+xml\b/.test(normalized);
}

function shouldCompressApiResponse(req: express.Request, res: express.Response) {
  if (req.headers.upgrade) {
    return false;
  }

  if (req.path !== "/api" && !req.path.startsWith("/api/")) {
    return false;
  }

  if (!isCompressibleApiContentType(res.getHeader("Content-Type"))) {
    return false;
  }

  return compression.filter(req, res);
}

export function registerLocalHttpCompression(app: Express) {
  app.use(compression({
    threshold: API_COMPRESSION_THRESHOLD_BYTES,
    level: HTTP_COMPRESSION_LEVEL,
    filter: shouldCompressApiResponse,
  }));
}
