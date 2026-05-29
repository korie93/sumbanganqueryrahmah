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
};

const MIN_PG_POOL_HEALTH_CHECK_INTERVAL_MS = 1_000;
const MIN_PG_POOL_HEALTH_CHECK_TIMEOUT_MS = 250;
const PG_POOL_HIGH_UTILIZATION_THRESHOLD = 0.85;
const POSTGRES_DEADLOCK_SQLSTATE = "40P01";
const PERCENT_MULTIPLIER = 100;
const PERCENT_PRECISION_MULTIPLIER = 10;

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

function removePoolListener(
  pool: PgPoolLike,
  event: string,
  listener: (...args: unknown[]) => void,
) {
  if (typeof pool.off === "function") {
    pool.off(event, listener);
    return;
  }

  pool.removeListener?.(event, listener);
}

export function bindPgPoolMonitoring(pool: PgPoolLike, options: BindPgPoolMonitoringOptions = {}) {
  const warnCooldownMs = Math.max(1_000, Number(options.warnCooldownMs || 60_000));
  const sink = options.logger ?? logger;
  const metrics = options.metrics ?? internalMetrics;
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

  pool.on("connect", handleConnect);
  pool.on("acquire", handleAcquire);
  pool.on("remove", handleRemove);
  pool.on("error", handleError);

  return () => {
    removePoolListener(pool, "connect", handleConnect);
    removePoolListener(pool, "acquire", handleAcquire);
    removePoolListener(pool, "remove", handleRemove);
    removePoolListener(pool, "error", handleError);
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
  let stopped = false;
  let checkInFlight = false;

  const runHealthCheck = async () => {
    if (stopped || checkInFlight) {
      return;
    }

    checkInFlight = true;
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
    } catch (error) {
      sink.warn("PostgreSQL pool health check failed", {
        ...getPgPoolSnapshot(pool),
        error,
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      checkInFlight = false;
    }
  };

  const intervalHandle = setInterval(() => {
    void runHealthCheck();
  }, intervalMs);
  intervalHandle.unref?.();

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(intervalHandle);
  };
}
