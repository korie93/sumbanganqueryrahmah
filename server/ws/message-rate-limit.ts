export const DEFAULT_RUNTIME_WS_MESSAGE_RATE_LIMIT_MAX = 30;
export const DEFAULT_RUNTIME_WS_MESSAGE_RATE_LIMIT_WINDOW_MS = 1_000;

export type RuntimeWsMessageRateLimiter = {
  consume: () => boolean;
  reset: () => void;
};

export type RuntimeWsMessageRateLimiterOptions = {
  maxMessages?: number;
  now?: () => number;
  windowMs?: number;
};

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.trunc(Number(value))
    : fallback;
}

export function createRuntimeWsMessageRateLimiter(
  options: RuntimeWsMessageRateLimiterOptions = {},
): RuntimeWsMessageRateLimiter {
  const maxMessages = normalizePositiveInteger(options.maxMessages, DEFAULT_RUNTIME_WS_MESSAGE_RATE_LIMIT_MAX);
  const windowMs = normalizePositiveInteger(options.windowMs, DEFAULT_RUNTIME_WS_MESSAGE_RATE_LIMIT_WINDOW_MS);
  const now = options.now ?? Date.now;
  let windowStartedAt = now();
  let count = 0;

  return {
    consume() {
      const currentTime = now();
      if (currentTime - windowStartedAt >= windowMs) {
        windowStartedAt = currentTime;
        count = 0;
      }

      count += 1;
      return count <= maxMessages;
    },
    reset() {
      windowStartedAt = now();
      count = 0;
    },
  };
}
