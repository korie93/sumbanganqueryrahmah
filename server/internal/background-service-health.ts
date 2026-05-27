import { logger } from "../lib/logger";
import {
  clearStartupServiceDegraded,
  markStartupServiceDegraded,
} from "./startup-health";

type BackgroundServiceHealthSignalOptions = {
  failureDetails: string;
  failureLogMessage: string;
  failureReason: string;
  maxRetryDelayMs?: number;
  retryDelayMs?: number;
  service: string;
  start: () => Promise<void>;
};

type BackgroundServiceHealthSignalHandle = {
  stop: () => void;
};

const DEFAULT_BACKGROUND_SERVICE_RETRY_DELAY_MS = 1_000;
const DEFAULT_BACKGROUND_SERVICE_MAX_RETRY_DELAY_MS = 30_000;
const BACKGROUND_SERVICE_MAX_EXPONENT = 6;

function resolveRetryDelayMs(params: {
  attempt: number;
  maxRetryDelayMs: number | undefined;
  retryDelayMs: number | undefined;
}): number {
  const baseDelayMs = Math.max(
    1,
    Math.floor(params.retryDelayMs ?? DEFAULT_BACKGROUND_SERVICE_RETRY_DELAY_MS),
  );
  const maxDelayMs = Math.max(
    baseDelayMs,
    Math.floor(params.maxRetryDelayMs ?? DEFAULT_BACKGROUND_SERVICE_MAX_RETRY_DELAY_MS),
  );
  const exponent = Math.min(Math.max(0, Math.floor(params.attempt)), BACKGROUND_SERVICE_MAX_EXPONENT);
  return Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
}

export function startBackgroundServiceWithHealthSignal(
  options: BackgroundServiceHealthSignalOptions,
): BackgroundServiceHealthSignalHandle {
  let stopped = false;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let startPromise: Promise<void> | null = null;

  const scheduleRetry = (): void => {
    if (stopped || retryTimer) {
      return;
    }

    const retryDelayMs = resolveRetryDelayMs({
      attempt: retryAttempt,
      maxRetryDelayMs: options.maxRetryDelayMs,
      retryDelayMs: options.retryDelayMs,
    });
    retryAttempt += 1;

    retryTimer = setTimeout(() => {
      retryTimer = null;
      runStartAttempt();
    }, retryDelayMs);
    retryTimer.unref?.();
  };

  const runStartAttempt = (): void => {
    if (stopped || startPromise) {
      return;
    }

    startPromise = options.start()
      .then(() => {
        if (stopped) {
          return;
        }
        retryAttempt = 0;
        clearStartupServiceDegraded(options.service);
      })
      .catch((error) => {
        if (stopped) {
          return;
        }

        markStartupServiceDegraded(options.service, options.failureReason, options.failureDetails);
        logger.error(options.failureLogMessage, {
          error,
          nextRetryDelayMs: resolveRetryDelayMs({
            attempt: retryAttempt,
            maxRetryDelayMs: options.maxRetryDelayMs,
            retryDelayMs: options.retryDelayMs,
          }),
          service: options.service,
        });
        scheduleRetry();
      })
      .finally(() => {
        startPromise = null;
      });
  };

  runStartAttempt();

  return {
    stop: () => {
      stopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    },
  };
}
