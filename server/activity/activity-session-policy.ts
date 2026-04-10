const MAX_HEARTBEAT_INTERVAL_MINUTES = 10;

export const ACTIVITY_IDLE_STATUS_THRESHOLD_MINUTES = 5;

function normalizePositiveMinutes(value: number | null | undefined, fallback: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(1, Math.floor(numericValue));
}

export function resolveHeartbeatIntervalMinutes(
  sessionTimeoutMinutes: number,
  wsIdleMinutes: number,
): number {
  const normalizedSessionTimeoutMinutes = normalizePositiveMinutes(sessionTimeoutMinutes, 30);
  const normalizedWsIdleMinutes = normalizePositiveMinutes(wsIdleMinutes, 3);
  const sessionBudgetMinutes = Math.max(1, Math.floor(normalizedSessionTimeoutMinutes / 2) || 1);
  const wsBudgetMinutes = Math.max(1, normalizedWsIdleMinutes - 1);
  const activityStatusBudgetMinutes = Math.max(1, ACTIVITY_IDLE_STATUS_THRESHOLD_MINUTES - 1);

  return Math.max(
    1,
    Math.min(
      MAX_HEARTBEAT_INTERVAL_MINUTES,
      sessionBudgetMinutes,
      wsBudgetMinutes,
      activityStatusBudgetMinutes,
    ),
  );
}
