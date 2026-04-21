import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import { HttpError } from "../http/errors";
import { wasRouteErrorLogged } from "../http/route-observability";
import type { RemoteErrorTracker } from "../lib/remote-error-tracking";
import { remoteErrorTracker } from "../lib/remote-error-tracking";
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

type ErrorHandlerOptions = {
  remoteErrorTracker?: Pick<RemoteErrorTracker, "captureServerError"> | null;
};

type RemoteErrorTrackingPayload = Parameters<RemoteErrorTracker["captureServerError"]>[0];

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

function readRoutePath(req: Request): string | undefined {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    return routePath;
  }

  if (Array.isArray(routePath)) {
    return routePath.join(",");
  }

  return undefined;
}

function serializeRemoteTrackingFailure(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

function captureServerErrorSafely(
  tracking: Pick<RemoteErrorTracker, "captureServerError"> | null,
  payload: RemoteErrorTrackingPayload,
) {
  if (!tracking) {
    return;
  }

  void tracking.captureServerError(payload).catch((error) => {
    logger.warn("Remote error tracking failed while handling an API error", {
      eventType: payload.eventType,
      path: payload.path,
      method: payload.method,
      requestId: payload.requestId,
      statusCode: payload.statusCode,
      error: serializeRemoteTrackingFailure(error),
    });
  });
}

export function createErrorHandler(options: ErrorHandlerOptions = {}) {
  const tracking = options.remoteErrorTracker ?? remoteErrorTracker;

  return function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
    if (res.headersSent) {
      return next(err);
    }

    const error = err as ErrorLike;
    const requestId = readCorrelationRequestId(req, res);
    const routePath = readRoutePath(req);

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

        captureServerErrorSafely(tracking, {
          code: err.code,
          errorName: "HttpError",
          eventType: "server.http_error",
          message: "Internal server error",
          method: req.method,
          path: req.path,
          requestId,
          routePath,
          statusCode: err.statusCode,
        });

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

    captureServerErrorSafely(tracking, {
      code: error?.code,
      errorName: typeof (err as { name?: unknown })?.name === "string"
        ? String((err as { name?: unknown }).name)
        : undefined,
      eventType: "server.unhandled_error",
      message: "Internal server error",
      method: req.method,
      path: req.path,
      requestId,
      routePath,
      statusCode: 500,
    });

    return res.status(500).json(buildApiErrorResponse("Internal server error", {
      requestId,
    }));
  };
}

export const errorHandler = createErrorHandler();
