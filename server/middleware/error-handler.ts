import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import { isProductionLikeEnvironment } from "../config/runtime-environment";
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

type ErrorHandlerOptions = {
  productionLike?: boolean | undefined;
};

type SanitizedErrorResponse = {
  message: string;
  details?: unknown;
  sanitized: boolean;
};

const FORBIDDEN_RESPONSE_INFO_PATTERNS = [
  /\bat\s+(?:[A-Za-z]:\\|\/|file:\/\/).+\.(?:cjs|mjs|js|jsx|ts|tsx):\d+(?::\d+)?/i,
  /\bat\s+\S+\s+\((?:[A-Za-z]:\\|\/|file:\/\/).+\.(?:cjs|mjs|js|jsx|ts|tsx):\d+(?::\d+)?\)/i,
  /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b[\s\S]{0,160}\b(?:FROM|INTO|TABLE|WHERE|SET|VALUES)\b/i,
  /(?:[A-Za-z]:\\|\/(?:home|var|srv|app|etc|tmp|usr)\/|[\\/](?:node_modules|dist-local|server)[\\/])/i,
  /\b(?:password|passwd|pwd|secret|token|cookie|authorization|api[_-]?key|private[_-]?key|connection[_-]?string|database[_-]?url|pg[_-]?password|smtp[_-]?password)\b/i,
  /(?:postgres(?:ql)?:\/\/|mysql:\/\/|redis:\/\/|mongodb(?:\+srv)?:\/\/)/i,
] as const;

const MAX_RESPONSE_INFO_SCAN_DEPTH = 4;
const MAX_RESPONSE_INFO_ARRAY_SCAN = 20;
const MAX_RESPONSE_INFO_OBJECT_KEYS_SCAN = 40;

function getGenericProductionMessage(statusCode: number): string {
  if (statusCode === 400) return "Invalid request.";
  if (statusCode === 401) return "Authentication required.";
  if (statusCode === 403) return "Forbidden.";
  if (statusCode === 404) return "Resource not found.";
  if (statusCode === 409) return "Conflict.";
  if (statusCode === 413) return "The request payload is too large to process.";
  if (statusCode === 429) return "Too many requests.";
  return "Internal server error";
}

export function containsForbiddenErrorResponseInfo(value: unknown, depth = 0): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return FORBIDDEN_RESPONSE_INFO_PATTERNS.some((pattern) => pattern.test(value));
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return false;
  }

  if (typeof value === "symbol" || typeof value === "function") {
    return false;
  }

  if (depth >= MAX_RESPONSE_INFO_SCAN_DEPTH) {
    return false;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_RESPONSE_INFO_ARRAY_SCAN)
      .some((item) => containsForbiddenErrorResponseInfo(item, depth + 1));
  }

  if (typeof value !== "object") {
    return containsForbiddenErrorResponseInfo(String(value), depth + 1);
  }

  return Object.entries(value as Record<string, unknown>)
    .slice(0, MAX_RESPONSE_INFO_OBJECT_KEYS_SCAN)
    .some(([key, nestedValue]) => (
      containsForbiddenErrorResponseInfo(key, depth + 1)
      || containsForbiddenErrorResponseInfo(nestedValue, depth + 1)
    ));
}

function sanitizeErrorForResponse(params: {
  message: string;
  details?: unknown;
  statusCode: number;
  productionLike: boolean;
}): SanitizedErrorResponse {
  const unsafeMessage = params.productionLike
    && containsForbiddenErrorResponseInfo(params.message);
  const unsafeDetails = params.productionLike
    && params.details !== undefined
    && containsForbiddenErrorResponseInfo(params.details);

  if (!unsafeMessage && !unsafeDetails) {
    return {
      message: params.message,
      ...(params.details !== undefined ? { details: params.details } : {}),
      sanitized: false,
    };
  }

  return {
    message: getGenericProductionMessage(params.statusCode),
    sanitized: true,
  };
}

function logSanitizedErrorResponse(params: {
  code?: string | undefined;
  method: string;
  path: string;
  requestId?: string | undefined;
  statusCode: number;
}) {
  logger.warn("Sanitized unsafe API error response", {
    path: params.path,
    method: params.method,
    requestId: params.requestId,
    code: params.code,
    statusCode: params.statusCode,
  });
}

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

export function createErrorHandler(options: ErrorHandlerOptions = {}) {
  const productionLike = options.productionLike ?? isProductionLikeEnvironment();

  return function errorHandlerInstance(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
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

      const sanitized = sanitizeErrorForResponse({
        message: err.message,
        details: err.details,
        statusCode: err.statusCode,
        productionLike,
      });
      if (sanitized.sanitized) {
        logSanitizedErrorResponse({
          path: req.path,
          method: req.method,
          requestId,
          code: err.code,
          statusCode: err.statusCode,
        });
      }

      return res.status(err.statusCode).json(buildApiErrorResponse(sanitized.message, {
        requestId,
        statusCode: err.statusCode,
        ...(err.code ? { code: err.code } : {}),
        ...(sanitized.details !== undefined ? { details: sanitized.details } : {}),
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
  };
}

export const errorHandler = createErrorHandler();
