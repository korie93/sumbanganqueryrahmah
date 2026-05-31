import { logger } from "../lib/logger";

export type TelemetryBucket = {
  count: number;
  windowEndsAtMs: number;
};

type TelemetryBucketLogger = Pick<typeof logger, "error">;

type TelemetrySweepSignalEmitter = {
  off?: (event: "SIGTERM", listener: () => void) => void;
  on: (event: "SIGTERM", listener: () => void) => void;
  removeListener?: (event: "SIGTERM", listener: () => void) => void;
};

type TelemetryBucketStoreOptions = {
  logger?: TelemetryBucketLogger;
  maxBuckets: number;
  now: () => number;
  signalEmitter?: TelemetrySweepSignalEmitter;
  sweepIntervalMs: number;
  windowMs: number;
};

const processTelemetrySweepStops = new Set<() => void>();
let processTelemetrySweepShutdownRegistered = false;

function runProcessTelemetrySweepShutdown(): void {
  for (const stop of Array.from(processTelemetrySweepStops)) {
    stop();
  }
}

function registerTelemetrySweepShutdownHandler(
  signalEmitter: TelemetrySweepSignalEmitter,
  stop: () => void,
): () => void {
  if (signalEmitter === process) {
    processTelemetrySweepStops.add(stop);
    if (!processTelemetrySweepShutdownRegistered) {
      process.on("SIGTERM", runProcessTelemetrySweepShutdown);
      processTelemetrySweepShutdownRegistered = true;
    }

    return () => {
      processTelemetrySweepStops.delete(stop);
      if (
        processTelemetrySweepShutdownRegistered
        && processTelemetrySweepStops.size === 0
      ) {
        process.off("SIGTERM", runProcessTelemetrySweepShutdown);
        processTelemetrySweepShutdownRegistered = false;
      }
    };
  }

  signalEmitter.on("SIGTERM", stop);
  return () => {
    if (typeof signalEmitter.off === "function") {
      signalEmitter.off("SIGTERM", stop);
    } else if (typeof signalEmitter.removeListener === "function") {
      signalEmitter.removeListener("SIGTERM", stop);
    }
  };
}

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
  const sweepLogger = options.logger ?? logger;
  const signalEmitter = options.signalEmitter ?? process;
  let sweepHandle: ReturnType<typeof setInterval> | null = null;
  let unregisterShutdownHandler: (() => void) | null = null;

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

  const removeShutdownHandler = () => {
    if (unregisterShutdownHandler) {
      unregisterShutdownHandler();
      unregisterShutdownHandler = null;
    }
  };

  const stop = () => {
    if (sweepHandle) {
      clearInterval(sweepHandle);
      sweepHandle = null;
    }
    removeShutdownHandler();
  };

  if (options.sweepIntervalMs > 0) {
    sweepHandle = setInterval(() => {
      try {
        sweepExpired(options.now());
      } catch (error) {
        sweepLogger.error("Telemetry drop bucket sweep failed", {
          event: "telemetry_drop_bucket_sweep_error",
          message: error instanceof Error ? error.message : "Unknown telemetry sweep failure",
        });
      }
    }, options.sweepIntervalMs);
    sweepHandle.unref?.();
    unregisterShutdownHandler = registerTelemetrySweepShutdownHandler(signalEmitter, stop);
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
    stop,
    sweepExpired,
  };
}
