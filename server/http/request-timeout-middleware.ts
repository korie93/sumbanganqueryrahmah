import type { RequestHandler } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import { getRequestContext } from "../lib/request-context";
import { logger } from "../lib/logger";

type CreateRequestTimeoutMiddlewareOptions = {
  timeoutMs: number;
};

function normalizeTimeoutMs(timeoutMs: number) {
  if (!Number.isFinite(timeoutMs)) {
    return 0;
  }

  return Math.max(0, Math.trunc(timeoutMs));
}

export function createRequestTimeoutMiddleware(
  options: CreateRequestTimeoutMiddlewareOptions,
): RequestHandler {
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);

  if (timeoutMs <= 0) {
    return (_req, _res, next) => next();
  }

  return (_req, res, next) => {
    const requestContext = getRequestContext();
    if (requestContext) {
      requestContext.requestTimeoutMs = timeoutMs;
      requestContext.requestDeadlineAtMs = Date.now() + timeoutMs;
      requestContext.requestTimedOut = false;
    }

    let finished = false;
    let timer: NodeJS.Timeout | null = setTimeout(() => {
      if (finished) {
        return;
      }

      finished = true;
      timer = null;

      if (requestContext) {
        requestContext.requestTimedOut = true;
      }

      requestContext?.abortController?.abort();

      logger.warn("HTTP request timed out", {
        timeoutMs,
      });

      if (!res.headersSent) {
        res.status(504).json({
          ok: false,
          message: "The request took too long to complete.",
          error: {
            code: ERROR_CODES.REQUEST_TIMEOUT,
            message: "The request took too long to complete.",
            details: {
              timeoutMs,
            },
          },
        });
      }
    }, timeoutMs);
    timer.unref?.();

    const clearTimer = () => {
      if (finished) {
        return;
      }

      finished = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    res.once("finish", clearTimer);
    res.once("close", clearTimer);
    next();
  };
}
