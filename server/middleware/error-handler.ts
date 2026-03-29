import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../http/errors";
import { logger } from "../lib/logger";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const error = err as {
    message?: string;
    code?: string;
    type?: string;
    status?: number;
    statusCode?: number;
  };

  if (error?.type === "entity.too.large" || error?.status === 413 || error?.statusCode === 413) {
    return res.status(413).json({
      ok: false,
      message: "The request payload is too large to process.",
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      ok: false,
      message: err.message,
      ...((err.code || err.details !== undefined)
        ? {
            error: {
              ...(err.code ? { code: err.code } : {}),
              message: err.message,
              ...(err.details !== undefined ? { details: err.details } : {}),
            },
          }
        : {}),
    });
  }

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
