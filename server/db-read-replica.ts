import type { Pool } from "pg";
import { internalMetrics, type InternalMetricsRecorder } from "./internal/metrics";
import {
  clearStartupServiceDegraded,
  markStartupServiceDegraded,
} from "./internal/startup-health";
import { logger as defaultLogger } from "./lib/logger";

export type ReadReplicaHealthState = "primary-only" | "healthy" | "degraded";

export type ReadReplicaHealthSnapshot = {
  configured: boolean;
  fallbackCount: number;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  state: ReadReplicaHealthState;
};

type LoggerLike = Pick<typeof defaultLogger, "warn">;

type CreateReadReplicaFallbackPoolOptions = {
  logger?: LoggerLike;
  metrics?: Pick<InternalMetricsRecorder, "increment">;
  now?: () => Date;
  warningCooldownMs?: number;
};

type BindReadReplicaHealthCheckOptions = CreateReadReplicaFallbackPoolOptions & {
  intervalMs?: number;
  timeoutMs?: number;
};

type ReadReplicaOperation = "read-query" | "health-check";

const READ_REPLICA_SERVICE_NAME = "postgres-read-replica";
const READ_REPLICA_FAILURE_REASON = "READ_REPLICA_UNAVAILABLE";
const READ_REPLICA_FAILURE_DETAILS = "PostgreSQL read replica is unavailable; read queries are falling back to primary.";
const DEFAULT_WARNING_COOLDOWN_MS = 30_000;
const DEFAULT_HEALTH_INTERVAL_MS = 60_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 5_000;

let configured = false;
let fallbackCount = 0;
let lastErrorAt: string | null = null;
let lastErrorCode: string | null = null;
let state: ReadReplicaHealthState = "primary-only";
let lastWarningAt = 0;

function readErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

function sanitizeReadReplicaError(error: unknown) {
  return {
    code: readErrorCode(error),
    name: error instanceof Error ? error.name : "UnknownError",
  };
}

export function configureReadReplicaHealth(isConfigured: boolean): void {
  configured = isConfigured;
  fallbackCount = 0;
  lastErrorAt = null;
  lastErrorCode = null;
  lastWarningAt = 0;
  state = isConfigured ? "healthy" : "primary-only";
  if (!isConfigured) {
    clearStartupServiceDegraded(READ_REPLICA_SERVICE_NAME);
  }
}

function markReadReplicaHealthy(): void {
  if (!configured) {
    return;
  }
  state = "healthy";
  clearStartupServiceDegraded(READ_REPLICA_SERVICE_NAME);
}

function markReadReplicaDegraded(params: {
  error: unknown;
  logger: LoggerLike;
  metrics: Pick<InternalMetricsRecorder, "increment">;
  now: () => Date;
  operation: ReadReplicaOperation;
  warningCooldownMs: number;
}): void {
  if (!configured) {
    return;
  }

  const now = params.now();
  state = "degraded";
  lastErrorAt = now.toISOString();
  lastErrorCode = readErrorCode(params.error);
  if (params.operation === "read-query") {
    fallbackCount += 1;
    params.metrics.increment("dbReadReplicaFallbacksTotal");
  } else {
    params.metrics.increment("dbReadReplicaHealthCheckFailuresTotal");
  }
  markStartupServiceDegraded(
    READ_REPLICA_SERVICE_NAME,
    READ_REPLICA_FAILURE_REASON,
    READ_REPLICA_FAILURE_DETAILS,
  );

  if (now.getTime() - lastWarningAt < params.warningCooldownMs) {
    return;
  }

  lastWarningAt = now.getTime();
  params.logger.warn("PostgreSQL read replica unavailable; falling back to primary", {
    error: sanitizeReadReplicaError(params.error),
    event: "db_read_replica_fallback",
    operation: params.operation,
  });
}

export function getReadReplicaHealthSnapshot(): ReadReplicaHealthSnapshot {
  return {
    configured,
    fallbackCount,
    lastErrorAt,
    lastErrorCode,
    state,
  };
}

export function createReadReplicaFallbackPool(
  primaryPool: Pool,
  replicaPool: Pool,
  options: CreateReadReplicaFallbackPoolOptions = {},
): Pool {
  const sink = options.logger ?? defaultLogger;
  const metrics = options.metrics ?? internalMetrics;
  const now = options.now ?? (() => new Date());
  const warningCooldownMs = Math.max(1_000, options.warningCooldownMs ?? DEFAULT_WARNING_COOLDOWN_MS);

  return new Proxy(replicaPool, {
    get(target, property, receiver) {
      if (property !== "query") {
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }

      return async (...args: unknown[]) => {
        try {
          const queryReplica = target.query.bind(target) as (...queryArgs: unknown[]) => Promise<unknown>;
          const result = await queryReplica(...args);
          markReadReplicaHealthy();
          return result;
        } catch (error) {
          markReadReplicaDegraded({
            error,
            logger: sink,
            metrics,
            now,
            operation: "read-query",
            warningCooldownMs,
          });
          const queryPrimary = primaryPool.query.bind(primaryPool) as (...queryArgs: unknown[]) => Promise<unknown>;
          return queryPrimary(...args);
        }
      };
    },
  }) as Pool;
}

export function bindReadReplicaHealthCheck(
  replicaPool: Pool | null,
  options: BindReadReplicaHealthCheckOptions = {},
): () => void {
  if (!replicaPool) {
    return () => undefined;
  }

  const sink = options.logger ?? defaultLogger;
  const metrics = options.metrics ?? internalMetrics;
  const now = options.now ?? (() => new Date());
  const intervalMs = Math.max(1_000, options.intervalMs ?? DEFAULT_HEALTH_INTERVAL_MS);
  const timeoutMs = Math.max(250, Math.min(intervalMs, options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS));
  const warningCooldownMs = Math.max(1_000, options.warningCooldownMs ?? DEFAULT_WARNING_COOLDOWN_MS);
  let stopped = false;
  let inFlight = false;

  const runCheck = async () => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      await Promise.race([
        replicaPool.query("SELECT 1"),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`PostgreSQL read replica health check timed out after ${timeoutMs}ms`));
          }, timeoutMs);
          timeoutHandle.unref?.();
        }),
      ]);
      markReadReplicaHealthy();
    } catch (error) {
      markReadReplicaDegraded({
        error,
        logger: sink,
        metrics,
        now,
        operation: "health-check",
        warningCooldownMs,
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      inFlight = false;
    }
  };

  const intervalHandle = setInterval(() => {
    void runCheck();
  }, intervalMs);
  intervalHandle.unref?.();
  void runCheck();

  return () => {
    stopped = true;
    clearInterval(intervalHandle);
  };
}
