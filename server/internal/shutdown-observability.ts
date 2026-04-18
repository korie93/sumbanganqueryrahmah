export type ShutdownPhaseName =
  | "signal-received"
  | "connection-drain-escalation"
  | "http-server-closed"
  | "pg-pool-closed"
  | "complete"
  | "timeout";

export type ShutdownPhaseTracker = {
  lastPhaseAtMs: number;
  startedAtMs: number;
};

export type ShutdownPhaseMetrics = {
  phase: ShutdownPhaseName;
  phaseDurationMs: number;
  shutdownDurationMs: number;
};

export function createShutdownPhaseTracker(startedAtMs = Date.now()): ShutdownPhaseTracker {
  return {
    lastPhaseAtMs: startedAtMs,
    startedAtMs,
  };
}

export function markShutdownPhase(
  tracker: ShutdownPhaseTracker,
  phase: ShutdownPhaseName,
  now = Date.now(),
): ShutdownPhaseMetrics {
  const normalizedNow = Math.max(now, tracker.startedAtMs, tracker.lastPhaseAtMs);
  const metrics = {
    phase,
    phaseDurationMs: normalizedNow - tracker.lastPhaseAtMs,
    shutdownDurationMs: normalizedNow - tracker.startedAtMs,
  };
  tracker.lastPhaseAtMs = normalizedNow;
  return metrics;
}

export function readShutdownDurationMs(
  tracker: ShutdownPhaseTracker,
  now = Date.now(),
): number {
  return Math.max(now, tracker.lastPhaseAtMs, tracker.startedAtMs) - tracker.startedAtMs;
}
