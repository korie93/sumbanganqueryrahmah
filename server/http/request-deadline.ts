import type { Response } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import { logger } from "../lib/logger";
import { getRequestContext } from "../lib/request-context";

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
  const requestContext = getRequestContext();
  const requestAbortSignal = requestContext?.abortSignal;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.trunc(options.timeoutMs))
    : 0;

  const controller = new AbortController();
  let detachRequestAbortListener: (() => void) | null = null;
  const attachRequestAbortListener = () => {
    if (!requestAbortSignal) {
      return;
    }

    if (requestAbortSignal.aborted) {
      controller.abort();
      return;
    }

    const handleRequestAbort = () => {
      controller.abort();
    };

    requestAbortSignal.addEventListener("abort", handleRequestAbort, { once: true });
    detachRequestAbortListener = () => {
      requestAbortSignal.removeEventListener("abort", handleRequestAbort);
    };
  };

  if (timeoutMs <= 0) {
    attachRequestAbortListener();
    return {
      timedOut: false,
      value: await Promise.resolve(operation(controller.signal)).finally(() => {
        detachRequestAbortListener?.();
      }),
    };
  }

  let settled = false;
  let timer: NodeJS.Timeout | null = null;

  const finalize = () => {
    settled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    detachRequestAbortListener?.();
    detachRequestAbortListener = null;
  };

  attachRequestAbortListener();

  const operationPromise = Promise.resolve()
    .then(() => operation(controller.signal))
    .then<RequestDeadlineResult<T>>((value) => {
      if (settled) {
        return { timedOut: true };
      }
      finalize();
      return {
        timedOut: false,
        value,
      };
    })
    .catch<RequestDeadlineResult<T>>((error: unknown) => {
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
