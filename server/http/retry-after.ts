type RetryAfterOptions = {
  retryAfterMs?: number | null | undefined;
  resetTime?: Date | number | null | undefined;
  windowMs?: number | null | undefined;
  now?: number;
};

function normalizeRetryDelayMs(options: RetryAfterOptions): number {
  if (typeof options.retryAfterMs === "number" && Number.isFinite(options.retryAfterMs)) {
    return options.retryAfterMs;
  }

  if (options.resetTime instanceof Date) {
    return options.resetTime.getTime() - (options.now ?? Date.now());
  }

  if (typeof options.resetTime === "number" && Number.isFinite(options.resetTime)) {
    return options.resetTime - (options.now ?? Date.now());
  }

  if (typeof options.windowMs === "number" && Number.isFinite(options.windowMs)) {
    return options.windowMs;
  }

  return 0;
}

export function resolveRetryAfterHeaderValue(options: RetryAfterOptions): string {
  const delayMs = Math.max(0, normalizeRetryDelayMs(options));
  return String(Math.max(1, Math.ceil(delayMs / 1000)));
}
