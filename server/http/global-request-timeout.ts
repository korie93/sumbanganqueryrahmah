import type { RequestHandler } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import { logger } from "../lib/logger";

type GlobalRequestTimeoutOptions = {
  timeoutMs: number;
};

function normalizeTimeoutMs(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 0;
}

function isStreamingLikeRequest(path: string) {
  return path.startsWith("/ws");
}

export function createGlobalRequestTimeoutMiddleware(
  options: GlobalRequestTimeoutOptions,
): RequestHandler {
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);

  if (timeoutMs <= 0) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    if (isStreamingLikeRequest(req.path)) {
      next();
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    res.locals.requestAbortSignal = controller.signal;
    const requestId = String(res.getHeader("x-request-id") || req.headers["x-request-id"] || "").trim();

    const clear = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      res.off("finish", clear);
      res.off("close", clear);
    };

    timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      controller.abort();
      res.off("finish", clear);
      res.off("close", clear);

      logger.warn("HTTP request exceeded global timeout", {
        ...(requestId ? { requestId } : {}),
        method: req.method,
        path: req.path,
        timeoutMs,
      });

      if (res.headersSent || res.writableEnded) {
        return;
      }

      res.status(504).json({
        ok: false,
        message: "Request timed out.",
        error: {
          code: ERROR_CODES.REQUEST_TIMEOUT,
          message: "Request timed out.",
          ...(requestId ? { requestId } : {}),
          details: {
            timeoutMs,
          },
        },
      });
    }, timeoutMs);
    timer.unref?.();

    res.once("finish", clear);
    res.once("close", clear);
    next();
  };
}
