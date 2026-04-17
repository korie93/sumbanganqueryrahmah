import type { Response } from "express";

type RateLimitHeaderInput = {
  limit?: number | undefined;
  remaining?: number | undefined;
  resetTime?: Date | number | null | undefined;
};

function normalizeRateLimitCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.trunc(value));
}

function normalizeRateLimitReset(value: Date | number | null | undefined): number | null {
  if (value instanceof Date) {
    const timestampMs = value.getTime();
    return Number.isFinite(timestampMs)
      ? Math.max(0, Math.ceil(timestampMs / 1000))
      : null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.ceil(value / 1000));
}

export function applyLegacyRateLimitHeaders(
  res: Response,
  headers: RateLimitHeaderInput,
) {
  const limit = normalizeRateLimitCount(headers.limit);
  const remaining = normalizeRateLimitCount(headers.remaining);
  const reset = normalizeRateLimitReset(headers.resetTime);

  if (limit !== null) {
    res.setHeader("X-RateLimit-Limit", String(limit));
  }

  if (remaining !== null) {
    res.setHeader("X-RateLimit-Remaining", String(remaining));
  }

  if (reset !== null) {
    res.setHeader("X-RateLimit-Reset", String(reset));
  }
}
