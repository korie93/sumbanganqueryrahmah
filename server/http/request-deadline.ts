import type { Response } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import { logger } from "../lib/logger";

type RequestDeadlineOptions = {
  timeoutMs: number;
  operationName: string;
  timeoutMessage: string;
};

export type RequestDeadlineResult<T> =
  | { timedOut: true }
  | { timedOut: false; value: T };

export async function runWithRequestDeadline<T>(
  res: Response,
  options: RequestDeadlineOptions,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<RequestDeadlineResult<T>> {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.trunc(options.timeoutMs))
    : 0;

  const controller = new AbortController();
  const upstreamSignal = res.locals?.requestAbortSignal as AbortSignal | undefined;
  let upstreamAborted = Boolean(upstreamSignal?.aborted);
  let settled = false;
  let timer: NodeJS.Timeout | null = null;
  const handleUpstreamAbort = () => {
    upstreamAborted = true;
    controller.abort();
  };
  if (upstreamSignal?.aborted) {
    handleUpstreamAbort();
  } else {
    upstreamSignal?.addEventListener("abort", handleUpstreamAbort, { once: true });
  }

  const finalize = () => {
    settled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    upstreamSignal?.removeEventListener("abort", handleUpstreamAbort);
  };

  if (timeoutMs <= 0) {
    try {
      const value = await operation(controller.signal);
      if (upstreamAborted) {
        return { timedOut: true };
      }
      return {
        timedOut: false,
        value,
      };
    } finally {
      finalize();
    }
  }

  const operationPromise = Promise.resolve()
    .then(() => operation(controller.signal))
    .then<RequestDeadlineResult<T>>((value) => {
      if (settled || upstreamAborted) {
        return { timedOut: true };
      }
      finalize();
      return {
        timedOut: false,
        value,
      };
    })
    .catch<RequestDeadlineResult<T>>((error: unknown) => {
      if (upstreamAborted) {
        finalize();
        return { timedOut: true };
      }
      if (settled) {
        logger.warn("Request operation settled after timeout response", {
          operationName: options.operationName,
          error,
        });
        return { timedOut: true };
      }
      finalize();
      throw error;
    });

  const timeoutPromise = new Promise<RequestDeadlineResult<T>>((resolve) => {
    timer = setTimeout(() => {
      if (settled) {
        resolve({ timedOut: true });
        return;
      }

      finalize();
      controller.abort();
      logger.warn("HTTP request exceeded deadline", {
        operationName: options.operationName,
        timeoutMs,
      });

      if (!res.headersSent) {
        res.status(504).json({
          ok: false,
          message: options.timeoutMessage,
          error: {
            code: ERROR_CODES.REQUEST_TIMEOUT,
            message: options.timeoutMessage,
            details: {
              operation: options.operationName,
              timeoutMs,
            },
          },
        });
      }

      resolve({ timedOut: true });
    }, timeoutMs);
    timer.unref?.();
  });

  return Promise.race([operationPromise, timeoutPromise]);
}
