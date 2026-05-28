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

type RequestDeadlineErrorLike = {
  code?: unknown;
  name?: unknown;
};

function sanitizeRequestDeadlineError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { name: "UnknownError" };
  }

  const errorLike = error as RequestDeadlineErrorLike;
  return {
    name: typeof errorLike.name === "string" ? errorLike.name : "Error",
    ...(typeof errorLike.code === "string" ? { code: errorLike.code } : {}),
  };
}

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
  if (upstreamSignal?.aborted) {
    controller.abort();
    return { timedOut: true };
  }

  let upstreamAborted = false;
  let settled = false;
  let timer: NodeJS.Timeout | null = null;
  let resolveUpstreamAbort: ((result: RequestDeadlineResult<T>) => void) | null = null;

  function finalize() {
    if (settled) {
      return;
    }
    settled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    upstreamSignal?.removeEventListener("abort", handleUpstreamAbort);
    resolveUpstreamAbort = null;
  }

  function handleUpstreamAbort() {
    upstreamAborted = true;
    controller.abort();
    const resolve = resolveUpstreamAbort;
    finalize();
    resolve?.({ timedOut: true });
  }

  upstreamSignal?.addEventListener("abort", handleUpstreamAbort, { once: true });

  const upstreamAbortPromise = new Promise<RequestDeadlineResult<T>>((resolve) => {
    resolveUpstreamAbort = resolve;
  });

  const timeoutPromise = timeoutMs > 0
    ? new Promise<RequestDeadlineResult<T>>((resolve) => {
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
    })
    : null;

  function buildDeadlineRace(
    operationPromise: Promise<RequestDeadlineResult<T>>,
  ): Promise<RequestDeadlineResult<T>> {
    return timeoutPromise
      ? Promise.race([operationPromise, timeoutPromise, upstreamAbortPromise])
      : Promise.race([operationPromise, upstreamAbortPromise]);
  }

  try {
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
            error: sanitizeRequestDeadlineError(error),
          });
          return { timedOut: true };
        }
        finalize();
        throw error;
      });

    return await buildDeadlineRace(operationPromise);
  } finally {
    if (!settled) {
      finalize();
    }
  }
}
