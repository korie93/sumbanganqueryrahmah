import compression from "compression";
import type express from "express";
import type { Express } from "express";

const API_COMPRESSION_THRESHOLD_BYTES = 1024;

function shouldCompressApiResponse(req: express.Request, res: express.Response) {
  if (req.headers.upgrade) {
    return false;
  }

  if (req.path !== "/api" && !req.path.startsWith("/api/")) {
    return false;
  }

  return compression.filter(req, res);
}

export function registerLocalHttpCompression(app: Express) {
  app.use(compression({
    threshold: API_COMPRESSION_THRESHOLD_BYTES,
    filter: shouldCompressApiResponse,
  }));
}
