export type TelemetryBucket = {
  count: number;
  windowEndsAtMs: number;
};

type TelemetryBucketStoreOptions = {
  maxBuckets: number;
  now: () => number;
  sweepIntervalMs: number;
  windowMs: number;
};

export type TelemetryBucketStore = {
  getBucket: (key: string, nowMs: number) => TelemetryBucket;
  stop: () => void;
  sweepExpired: (nowMs: number) => void;
};

function resolveOldestBucketKey(buckets: Map<string, TelemetryBucket>) {
  let oldestKey: string | null = null;
  let oldestWindowEndsAtMs = Number.POSITIVE_INFINITY;
  for (const [key, bucket] of buckets) {
    if (bucket.windowEndsAtMs < oldestWindowEndsAtMs) {
      oldestKey = key;
      oldestWindowEndsAtMs = bucket.windowEndsAtMs;
    }
  }

  return oldestKey;
}

export function createTelemetryBucketStore(
  options: TelemetryBucketStoreOptions,
): TelemetryBucketStore {
  const buckets = new Map<string, TelemetryBucket>();
  let sweepHandle: ReturnType<typeof setInterval> | null = null;

  const sweepExpired = (nowMs: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.windowEndsAtMs <= nowMs) {
        buckets.delete(key);
      }
    }

    while (buckets.size > options.maxBuckets) {
      const oldestKey = resolveOldestBucketKey(buckets);
      if (!oldestKey) {
        break;
      }
      buckets.delete(oldestKey);
    }
  };

  if (options.sweepIntervalMs > 0) {
    sweepHandle = setInterval(() => {
      sweepExpired(options.now());
    }, options.sweepIntervalMs);
    sweepHandle.unref();
  }

  return {
    getBucket(key, nowMs) {
      const existingBucket = buckets.get(key);
      const bucket = existingBucket && existingBucket.windowEndsAtMs > nowMs
        ? existingBucket
        : { count: 0, windowEndsAtMs: nowMs + options.windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);
      if (buckets.size > options.maxBuckets) {
        sweepExpired(nowMs);
      }
      return bucket;
    },
    stop() {
      if (!sweepHandle) {
        return;
      }

      clearInterval(sweepHandle);
      sweepHandle = null;
    },
    sweepExpired,
  };
}
