import { logger } from "./lib/logger";

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
};

type LoggerLike = Pick<typeof logger, "warn" | "error">;

type BindPgPoolMonitoringOptions = {
  warnCooldownMs?: number;
  logger?: LoggerLike;
};

type BindPgPoolHealthCheckOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  logger?: LoggerLike;
};

const MIN_PG_POOL_HEALTH_CHECK_INTERVAL_MS = 1_000;
const MIN_PG_POOL_HEALTH_CHECK_TIMEOUT_MS = 250;

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

export function hasPgPoolPressure(snapshot: PgPoolSnapshot): boolean {
  return snapshot.max > 0 && snapshot.waiting > 0 && snapshot.idle <= 0 && snapshot.total >= snapshot.max;
}

export function bindPgPoolMonitoring(pool: PgPoolLike, options: BindPgPoolMonitoringOptions = {}) {
  const warnCooldownMs = Math.max(1_000, Number(options.warnCooldownMs || 60_000));
  const sink = options.logger ?? logger;
  let lastWarningAt = 0;
  let lastWarningSignature = "";

  const maybeWarnPressure = (source: string) => {
    const snapshot = getPgPoolSnapshot(pool);

    if (!hasPgPoolPressure(snapshot)) {
      lastWarningSignature = "";
      return;
    }

    const signature = `${snapshot.total}:${snapshot.idle}:${snapshot.waiting}:${snapshot.max}`;
    const now = Date.now();
    if (signature === lastWarningSignature && now - lastWarningAt < warnCooldownMs) {
      return;
    }

    lastWarningAt = now;
    lastWarningSignature = signature;
    sink.warn("PostgreSQL pool pressure detected", {
      ...snapshot,
      source,
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
    pool.off?.("connect", handleConnect);
    pool.off?.("acquire", handleAcquire);
    pool.off?.("remove", handleRemove);
    pool.off?.("error", handleError);
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
