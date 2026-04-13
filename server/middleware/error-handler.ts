import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import { HttpError } from "../http/errors";
import { wasRouteErrorLogged } from "../http/route-observability";
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
  requestId?: string;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
};

function readCorrelationRequestId(req: Request, res: Response): string | undefined {
  const responseRequestId = typeof res.getHeader === "function"
    ? String(res.getHeader("x-request-id") || "").trim()
    : "";
  if (responseRequestId) {
    return responseRequestId;
  }

  const requestHeader = req.headers ? String(req.headers["x-request-id"] || "").trim() : "";
  return requestHeader || undefined;
}

function buildApiErrorResponse(
  message: string,
  options?: {
    code?: string | undefined;
    details?: unknown;
    includeError?: boolean | undefined;
    requestId?: string | undefined;
  },
): ApiErrorResponse {
  const includeError = options?.includeError || Boolean(options?.code || options?.details !== undefined);

  return {
    ok: false,
    message,
    ...(options?.requestId ? { requestId: options.requestId } : {}),
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
  const requestId = readCorrelationRequestId(req, res);

  if (error?.type === "entity.too.large" || error?.status === 413 || error?.statusCode === 413) {
    return res.status(413).json(buildApiErrorResponse("The request payload is too large to process.", {
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      includeError: true,
      requestId,
    }));
  }

  if (err instanceof HttpError) {
    if (!err.expose) {
      if (!wasRouteErrorLogged(err)) {
        logger.error("Unhandled API HttpError", {
          path: req.path,
          method: req.method,
          requestId,
          code: err.code,
          statusCode: err.statusCode,
          message: err.message,
        });
      }

      return res.status(err.statusCode).json(buildApiErrorResponse("Internal server error", {
        requestId,
      }));
    }

    return res.status(err.statusCode).json(buildApiErrorResponse(err.message, {
      requestId,
      ...(err.code ? { code: err.code } : {}),
      ...(err.details !== undefined ? { details: err.details } : {}),
    }));
  }

  if (!wasRouteErrorLogged(err)) {
    logger.error("Unhandled API error", {
      path: req.path,
      method: req.method,
      requestId,
      code: error?.code,
      message: error?.message,
    });
  }

  return res.status(500).json(buildApiErrorResponse("Internal server error", {
    requestId,
  }));
}
