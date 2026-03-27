export type RuntimeMonitorTaskKind =
  | "rollupRefreshSnapshot"
  | "alertHistorySync"
  | "intelligenceEvaluation";

export function resolveRuntimeMonitorTaskIntervalMs(
  task: RuntimeMonitorTaskKind,
  options: { lowMemoryMode: boolean },
) {
  const lowMemoryMode = Boolean(options.lowMemoryMode);

  switch (task) {
    case "rollupRefreshSnapshot":
      return lowMemoryMode ? 30_000 : 15_000;
    case "alertHistorySync":
      return lowMemoryMode ? 60_000 : 30_000;
    case "intelligenceEvaluation":
      return lowMemoryMode ? 30_000 : 15_000;
    default:
      return 30_000;
  }
}

export function shouldRunRuntimeMonitorTask(params: {
  lastRunAt: number;
  now: number;
  intervalMs: number;
  force?: boolean;
}) {
  if (params.force) {
    return true;
  }

  if (!Number.isFinite(params.lastRunAt) || params.lastRunAt <= 0) {
    return true;
  }

  return params.now - params.lastRunAt >= Math.max(1_000, params.intervalMs);
}
