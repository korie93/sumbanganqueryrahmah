import { logger } from "./lib/logger";
import { internalMetrics, type InternalMetricsRecorder } from "./internal/metrics";

type PgPoolLike = {
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
  options?: {
    max?: number;
  };
  query?(text: string): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  listenerCount?(event: string): number;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
};

type LoggerLike = Pick<typeof logger, "warn" | "error">;

type BindPgPoolMonitoringOptions = {
  warnCooldownMs?: number;
  logger?: LoggerLike;
  metrics?: Pick<InternalMetricsRecorder, "increment">;
};

type BindPgPoolHealthCheckOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  logger?: LoggerLike;
  maxConsecutiveFailures?: number;
  metrics?: Pick<InternalMetricsRecorder, "increment">;
  now?: () => number;
  random?: () => number;
  recoveryBaseDelayMs?: number;
  recoveryMaxDelayMs?: number;
  recoveryJitterRatio?: number;
};

const MIN_PG_POOL_HEALTH_CHECK_INTERVAL_MS = 1_000;
const MIN_PG_POOL_HEALTH_CHECK_TIMEOUT_MS = 250;
const PG_POOL_HIGH_UTILIZATION_THRESHOLD = 0.85;
const POSTGRES_DEADLOCK_SQLSTATE = "40P01";
const PERCENT_MULTIPLIER = 100;
const PERCENT_PRECISION_MULTIPLIER = 10;
const PG_POOL_LISTENER_COUNT_WARNING_THRESHOLD = 5;
const MAX_CONSECUTIVE_PG_POOL_HEALTH_CHECK_FAILURES = 5;
const PG_POOL_HEALTH_CHECK_RECOVERY_BASE_DELAY_MS = 5_000;
const PG_POOL_HEALTH_CHECK_RECOVERY_MAX_DELAY_MS = 60_000;
const PG_POOL_HEALTH_CHECK_RECOVERY_JITTER_RATIO = 0.2;

export type PgPoolSnapshot = {
  total: number;
  idle: number;
  waiting: number;
  max: number;
};

export function getPgPoolSnapshot(pool: PgPoolLike): PgPoolSnapshot {
  return {
    total: Math.max(0, Number(pool.totalCount || 0)),
    idle: Math.max(0, Number(pool.idleCount || 0)),
    waiting: Math.max(0, Number(pool.waitingCount || 0)),
    max: Math.max(0, Number(pool.options?.max || 0)),
  };
}

export function getPgPoolUtilization(snapshot: PgPoolSnapshot): number {
  if (snapshot.max <= 0) {
    return 0;
  }

  const activeClients = Math.max(0, snapshot.total - snapshot.idle);
  return Math.min(1, activeClients / snapshot.max);
}

export function getPgPoolUtilizationPercent(snapshot: PgPoolSnapshot): number {
  return Math.round(
    getPgPoolUtilization(snapshot) * PERCENT_MULTIPLIER * PERCENT_PRECISION_MULTIPLIER,
  ) / PERCENT_PRECISION_MULTIPLIER;
}

export function resolvePgPoolPressureReason(snapshot: PgPoolSnapshot): string | null {
  if (snapshot.max <= 0) {
    return null;
  }

  if (snapshot.waiting > 0 && snapshot.idle <= 0 && snapshot.total >= snapshot.max) {
    return "waiting_queue";
  }

  if (getPgPoolUtilization(snapshot) >= PG_POOL_HIGH_UTILIZATION_THRESHOLD) {
    return "high_utilization";
  }

  return null;
}

export function hasPgPoolPressure(snapshot: PgPoolSnapshot): boolean {
  return resolvePgPoolPressureReason(snapshot) !== null;
}

export function isPgDeadlockError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === POSTGRES_DEADLOCK_SQLSTATE
  );
}

type PgPoolListenerRegistration = {
  event: string;
  listener: (...args: unknown[]) => void;
};

function removePoolListener(pool: PgPoolLike, registration: PgPoolListenerRegistration) {
  if (typeof pool.removeListener === "function") {
    pool.removeListener(registration.event, registration.listener);
    return;
  }

  if (typeof pool.off === "function") {
    pool.off(registration.event, registration.listener);
    return;
  }

  throw new Error("PostgreSQL pool listener removal is unavailable");
}

function createPgPoolListenerRegistry(pool: PgPoolLike, sink: LoggerLike) {
  let registrations: PgPoolListenerRegistration[] = [];

  const register = (event: string, listener: (...args: unknown[]) => void) => {
    const existingCount = typeof pool.listenerCount === "function"
      ? pool.listenerCount(event)
      : 0;

    if (existingCount > PG_POOL_LISTENER_COUNT_WARNING_THRESHOLD) {
      sink.warn("PostgreSQL pool listener count is unexpectedly high", {
        event: "pg_pool_listener_count_high",
        poolEvent: event,
        listenerCount: existingCount,
      });
    }

    pool.on(event, listener);
    registrations.push({ event, listener });
  };

  const cleanup = () => {
    if (registrations.length === 0) {
      return;
    }

    const remaining: PgPoolListenerRegistration[] = [];
    let firstError: unknown = null;

    for (const registration of registrations) {
      try {
        removePoolListener(pool, registration);
      } catch (error) {
        remaining.push(registration);
        firstError ??= error;
        sink.error("Failed to remove PostgreSQL pool listener", {
          event: "pg_pool_listener_removal_failed",
          poolEvent: registration.event,
          error,
        });
      }
    }

    registrations = remaining;

    if (firstError) {
      throw firstError;
    }
  };

  return {
    cleanup,
    register,
  };
}

export function bindPgPoolMonitoring(pool: PgPoolLike, options: BindPgPoolMonitoringOptions = {}) {
  const warnCooldownMs = Math.max(1_000, Number(options.warnCooldownMs || 60_000));
  const sink = options.logger ?? logger;
  const metrics = options.metrics ?? internalMetrics;
  const listenerRegistry = createPgPoolListenerRegistry(pool, sink);
  let lastWarningAt = 0;
  let lastWarningSignature = "";

  const maybeWarnPressure = (source: string) => {
    const snapshot = getPgPoolSnapshot(pool);
    const pressureReason = resolvePgPoolPressureReason(snapshot);

    if (!pressureReason) {
      lastWarningSignature = "";
      return;
    }

    const utilizationPercent = getPgPoolUtilizationPercent(snapshot);
    const signature = `${snapshot.total}:${snapshot.idle}:${snapshot.waiting}:${snapshot.max}:${pressureReason}`;
    const now = Date.now();
    if (signature === lastWarningSignature && now - lastWarningAt < warnCooldownMs) {
      return;
    }

    lastWarningAt = now;
    lastWarningSignature = signature;
    sink.warn("PostgreSQL pool pressure detected", {
      ...snapshot,
      reason: pressureReason,
      source,
      utilizationPercent,
    });
  };

  const handleConnect = () => {
    maybeWarnPressure("pool-connect");
  };

  const handleAcquire = () => {
    maybeWarnPressure("pool-acquire");
  };

  const handleRemove = () => {
    maybeWarnPressure("pool-remove");
  };

  const handleError = (error: unknown) => {
    if (isPgDeadlockError(error)) {
      metrics.increment("dbDeadlocksTotal");
      sink.error("PostgreSQL deadlock detected", {
        ...getPgPoolSnapshot(pool),
        event: "db_deadlock_detected",
        code: POSTGRES_DEADLOCK_SQLSTATE,
      });
    }

    sink.error("PostgreSQL pool client error", {
      ...getPgPoolSnapshot(pool),
      error,
    });
    maybeWarnPressure("pool-error");
  };

  listenerRegistry.register("connect", handleConnect);
  listenerRegistry.register("acquire", handleAcquire);
  listenerRegistry.register("remove", handleRemove);
  listenerRegistry.register("error", handleError);

  return () => {
    listenerRegistry.cleanup();
  };
}

export function bindPgPoolHealthCheck(pool: PgPoolLike, options: BindPgPoolHealthCheckOptions = {}) {
  if (typeof pool.query !== "function") {
    return () => undefined;
  }

  const intervalMs = Math.max(MIN_PG_POOL_HEALTH_CHECK_INTERVAL_MS, Number(options.intervalMs || 60_000));
  const timeoutMs = Math.max(
    MIN_PG_POOL_HEALTH_CHECK_TIMEOUT_MS,
    Math.min(intervalMs, Number(options.timeoutMs || 5_000)),
  );
  const sink = options.logger ?? logger;
  const metrics = options.metrics ?? internalMetrics;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const maxConsecutiveFailures = Math.max(
    1,
    Math.floor(options.maxConsecutiveFailures || MAX_CONSECUTIVE_PG_POOL_HEALTH_CHECK_FAILURES),
  );
  const recoveryBaseDelayMs = Math.max(
    intervalMs,
    Math.trunc(Number(options.recoveryBaseDelayMs || PG_POOL_HEALTH_CHECK_RECOVERY_BASE_DELAY_MS)),
  );
  const recoveryMaxDelayMs = Math.max(
    recoveryBaseDelayMs,
    Math.trunc(Number(options.recoveryMaxDelayMs || PG_POOL_HEALTH_CHECK_RECOVERY_MAX_DELAY_MS)),
  );
  const recoveryJitterRatio = Math.max(
    0,
    Math.min(1, Number(options.recoveryJitterRatio ?? PG_POOL_HEALTH_CHECK_RECOVERY_JITTER_RATIO)),
  );
  let stopped = false;
  let checkInFlight = false;
  let consecutiveFailures = 0;
  let recoveryAttempt = 0;
  let recoveryProbeAfter = 0;
  let recoveryMode = false;
  let intervalHandle: NodeJS.Timeout | null = null;

  const stopHealthCheck = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };

  const runHealthCheck = async () => {
    if (stopped) {
      return;
    }

    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
      await Promise.race([
        pool.query!("SELECT 1"),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`PostgreSQL pool health check timed out after ${timeoutMs}ms`));
          }, timeoutMs);
          timeoutHandle.unref?.();
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  };

  const resolveRecoveryDelayMs = (attempt: number) => {
    const exponentialDelay = recoveryBaseDelayMs * (2 ** Math.min(Math.max(0, attempt - 1), 6));
    const boundedDelay = Math.min(recoveryMaxDelayMs, exponentialDelay);
    const jitter = Math.floor(boundedDelay * recoveryJitterRatio * random());
    return boundedDelay + jitter;
  };

  const scheduleRecoveryProbe = () => {
    recoveryMode = true;
    recoveryAttempt += 1;
    recoveryProbeAfter = now() + resolveRecoveryDelayMs(recoveryAttempt);
  };

  const runHealthCheckSafely = (isRecoveryProbe: boolean) => {
    (async () => {
      try {
        if (isRecoveryProbe) {
          metrics.increment("dbHealthCheckRecoveryAttemptsTotal");
        }
        await runHealthCheck();
        if (recoveryMode) {
          metrics.increment("dbHealthCheckRecoverySuccessTotal");
          sink.warn("PostgreSQL pool health check recovered", {
            ...getPgPoolSnapshot(pool),
            recoveryAttempt,
          });
        }
        consecutiveFailures = 0;
        recoveryAttempt = 0;
        recoveryProbeAfter = 0;
        recoveryMode = false;
      } catch (error) {
        const enteringRecovery = !recoveryMode && consecutiveFailures + 1 >= maxConsecutiveFailures;
        consecutiveFailures += 1;
        metrics.increment("dbHealthCheckFailuresTotal");
        sink.warn("PostgreSQL pool health check failed", {
          ...getPgPoolSnapshot(pool),
          consecutiveFailures,
          error,
        });

        if (consecutiveFailures >= maxConsecutiveFailures) {
          if (enteringRecovery) {
            metrics.increment("dbHealthCheckCircuitBreaksTotal");
            sink.error("PostgreSQL pool health check entering recovery backoff after repeated failures", {
              ...getPgPoolSnapshot(pool),
              consecutiveFailures,
            });
          }
          scheduleRecoveryProbe();
        }
      } finally {
        checkInFlight = false;
      }
    })();
  };

  intervalHandle = setInterval(() => {
    if (stopped) {
      return;
    }

    if (checkInFlight) {
      metrics.increment("dbHealthCheckSkippedConcurrentTotal");
      return;
    }

    if (recoveryMode && now() < recoveryProbeAfter) {
      return;
    }

    checkInFlight = true;
    runHealthCheckSafely(recoveryMode);
  }, intervalMs);
  intervalHandle.unref?.();

  return stopHealthCheck;
}
