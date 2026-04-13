type ShutdownLogger = {
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
      phase,
      error: result.error,
    });
    return false;
  }

  if (result.kind === "timeout") {
    logger.error("PostgreSQL pool shutdown timed out", {
      phase,
      timeoutMs,
    });
    return false;
  }

  return true;
}
