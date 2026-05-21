import type { IncomingMessage } from "node:http";
import { firstHeaderValue } from "./ws-auth";

export type RuntimeWsUpgradeRateLimiter = {
  consume: (key: string) => boolean;
  clear: () => void;
};

export type RuntimeWsUpgradeRateLimitOptions = {
  maxAttempts?: number;
  windowMs?: number;
  maxKeys?: number;
  now?: () => number;
};

const DEFAULT_MAX_ATTEMPTS = 30;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_KEYS = 5_000;
const UNKNOWN_CLIENT_KEY = "unknown";

type RateLimitBucket = {
  count: number;
  resetAt: number;
  lastSeenAt: number;
};

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function pruneExpiredBuckets(
  buckets: Map<string, RateLimitBucket>,
  now: number,
  maxKeys: number,
) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  while (buckets.size > maxKeys) {
    let oldestKey: string | null = null;
    let oldestSeenAt = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of buckets) {
      if (bucket.lastSeenAt < oldestSeenAt) {
        oldestSeenAt = bucket.lastSeenAt;
        oldestKey = key;
      }
    }

    if (!oldestKey) {
      return;
    }
    buckets.delete(oldestKey);
  }
}

export function createRuntimeWsUpgradeRateLimiter(
  options: RuntimeWsUpgradeRateLimitOptions = {},
): RuntimeWsUpgradeRateLimiter {
  const maxAttempts = normalizePositiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const windowMs = normalizePositiveInteger(options.windowMs, DEFAULT_WINDOW_MS);
  const maxKeys = normalizePositiveInteger(options.maxKeys, DEFAULT_MAX_KEYS);
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, RateLimitBucket>();

  return {
    consume(rawKey: string) {
      const timestamp = now();
      const key = rawKey.trim() || UNKNOWN_CLIENT_KEY;
      pruneExpiredBuckets(buckets, timestamp, maxKeys);

      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= timestamp) {
        buckets.set(key, {
          count: 1,
          resetAt: timestamp + windowMs,
          lastSeenAt: timestamp,
        });
        return true;
      }

      existing.count += 1;
      existing.lastSeenAt = timestamp;
      return existing.count <= maxAttempts;
    },
    clear() {
      buckets.clear();
    },
  };
}

export function readRuntimeWsUpgradeRateLimitKey(
  req: Pick<IncomingMessage, "headers" | "socket">,
  options: { trustForwardedHeaders: boolean },
): string {
  if (options.trustForwardedHeaders) {
    const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]).split(",")[0]?.trim();
    if (forwardedFor) {
      return forwardedFor;
    }
  }

  return req.socket.remoteAddress || UNKNOWN_CLIENT_KEY;
}
