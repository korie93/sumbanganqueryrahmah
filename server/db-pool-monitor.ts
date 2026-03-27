import { logger } from "./lib/logger";

type PgPoolLike = {
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
  options?: {
    max?: number;
  };
  on(event: string, listener: (...args: any[]) => void): unknown;
  off?(event: string, listener: (...args: any[]) => void): unknown;
};

type LoggerLike = Pick<typeof logger, "warn" | "error">;

type BindPgPoolMonitoringOptions = {
  warnCooldownMs?: number;
  logger?: LoggerLike;
};

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
  return snapshot.waiting > 0;
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
