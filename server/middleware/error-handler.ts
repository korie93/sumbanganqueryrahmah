import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import { buildApiErrorResponse } from "../http/api-error-response";
import { HttpError } from "../http/errors";
import { sanitizeRequestId } from "../http/request-id";
import { wasRouteErrorLogged } from "../http/route-observability";
import { logger } from "../lib/logger";

type ErrorLike = {
  message?: string;
  code?: string;
  type?: string;
  status?: number;
  statusCode?: number;
};

function readCorrelationRequestId(req: Request, res: Response): string | undefined {
  const responseRequestId = typeof res.getHeader === "function"
    ? sanitizeRequestId(res.getHeader("x-request-id"))
    : "";
  if (responseRequestId) {
    return responseRequestId;
  }

  const requestHeader = req.headers ? sanitizeRequestId(req.headers["x-request-id"]) : "";
  return requestHeader || undefined;
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
      requestId,
      statusCode: 413,
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
        statusCode: err.statusCode,
      }));
    }

    return res.status(err.statusCode).json(buildApiErrorResponse(err.message, {
      requestId,
      statusCode: err.statusCode,
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
    statusCode: 500,
  }));
}
