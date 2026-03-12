import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../http/errors";
import { logger } from "../lib/logger";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      ok: false,
      message: err.message,
      ...(err.code ? { error: { code: err.code, message: err.message } } : {}),
    });
  }

  const error = err as { message?: string; code?: string };
  logger.error("Unhandled API error", {
    path: req.path,
    method: req.method,
    code: error?.code,
    message: error?.message,
  });

  return res.status(500).json({
    ok: false,
    message: "Internal server error",
  });
}
