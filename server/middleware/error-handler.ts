import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../http/errors";
import { logger } from "../lib/logger";

type ErrorLike = {
  message?: string;
  code?: string;
  type?: string;
  status?: number;
  statusCode?: number;
};

type ApiErrorResponse = {
  ok: false;
  message: string;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
};

function buildApiErrorResponse(
  message: string,
  options?: { code?: string; details?: unknown; includeError?: boolean },
): ApiErrorResponse {
  const includeError = options?.includeError || Boolean(options?.code || options?.details !== undefined);

  return {
    ok: false,
    message,
    ...(includeError
      ? {
          error: {
            ...(options?.code ? { code: options.code } : {}),
            message,
            ...(options?.details !== undefined ? { details: options.details } : {}),
          },
        }
      : {}),
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const error = err as ErrorLike;

  if (error?.type === "entity.too.large" || error?.status === 413 || error?.statusCode === 413) {
    return res.status(413).json(buildApiErrorResponse("The request payload is too large to process.", {
      code: "PAYLOAD_TOO_LARGE",
      includeError: true,
    }));
  }

  if (err instanceof HttpError) {
    if (!err.expose) {
      logger.error("Unhandled API HttpError", {
        path: req.path,
        method: req.method,
        code: err.code,
        statusCode: err.statusCode,
        message: err.message,
      });

      return res.status(err.statusCode).json(buildApiErrorResponse("Internal server error"));
    }

    return res.status(err.statusCode).json(buildApiErrorResponse(err.message, {
      code: err.code,
      details: err.details,
    }));
  }

  logger.error("Unhandled API error", {
    path: req.path,
    method: req.method,
    code: error?.code,
    message: error?.message,
  });

  return res.status(500).json(buildApiErrorResponse("Internal server error"));
}
