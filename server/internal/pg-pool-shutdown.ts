type ShutdownLogger = {
  info?: (message: string, metadata?: Record<string, unknown>) => void;
  warn?: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
};

type PgPoolLike = {
  end: () => Promise<void>;
};

type StopBackgroundTasks = () => void;

type ShutdownPgPoolSafelyOptions = {
  logger: ShutdownLogger;
  phase: "graceful-shutdown" | "startup-failure";
  poolRef: PgPoolLike;
  stopBackgroundTasks: StopBackgroundTasks;
  timeoutMs: number;
};

type ShutdownPgPoolResult =
  | { kind: "closed" }
  | { kind: "error"; error: unknown }
  | { kind: "timeout" };

export function resolvePgPoolShutdownTimeoutMs(gracefulShutdownTimeoutMs: number) {
  return Math.max(1_000, Math.min(5_000, Math.floor(gracefulShutdownTimeoutMs / 2)));
}

export async function shutdownPgPoolSafely({
  logger,
  phase,
  poolRef,
  stopBackgroundTasks,
  timeoutMs,
}: ShutdownPgPoolSafelyOptions) {
  const startedAt = Date.now();

  logger.info?.("PostgreSQL pool shutdown drain started", {
    event: "db_pool_drain_start",
    phase,
    timeoutMs,
  });

  try {
    stopBackgroundTasks();
  } catch (error) {
    logger.error("Failed to stop PostgreSQL pool background tasks during shutdown", {
      phase,
      error,
    });
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const poolEndPromise = Promise.resolve()
    .then(() => poolRef.end())
    .then<ShutdownPgPoolResult>(() => ({ kind: "closed" }))
    .catch<ShutdownPgPoolResult>((error: unknown) => ({ kind: "error", error }));

  const timeoutPromise = new Promise<ShutdownPgPoolResult>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ kind: "timeout" });
    }, timeoutMs);
    timeoutHandle.unref?.();
  });

  const result = await Promise.race([poolEndPromise, timeoutPromise]);

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }

  if (result.kind === "error") {
    logger.error("Failed to close PostgreSQL pool during shutdown", {
      event: "db_pool_drain_error",
      phase,
      elapsedMs: Date.now() - startedAt,
      error: result.error,
    });
    logger.info?.("PostgreSQL pool shutdown drain completed", {
      event: "db_pool_drain_complete",
      phase,
      outcome: "error",
      elapsedMs: Date.now() - startedAt,
    });
    return false;
  }

  if (result.kind === "timeout") {
    logger.warn?.("PostgreSQL pool shutdown drain timed out", {
      event: "db_pool_drain_timeout",
      phase,
      timeoutMs,
      elapsedMs: Date.now() - startedAt,
      action: "continue_shutdown_after_timeout",
    });
    logger.error("PostgreSQL pool shutdown timed out", {
      event: "db_pool_drain_timeout",
      phase,
      timeoutMs,
      elapsedMs: Date.now() - startedAt,
    });
    logger.info?.("PostgreSQL pool shutdown drain completed", {
      event: "db_pool_drain_complete",
      phase,
      outcome: "timeout",
      elapsedMs: Date.now() - startedAt,
    });
    return false;
  }

  logger.info?.("PostgreSQL pool shutdown drain completed", {
    event: "db_pool_drain_complete",
    phase,
    outcome: "closed",
    elapsedMs: Date.now() - startedAt,
  });
  return true;
}
