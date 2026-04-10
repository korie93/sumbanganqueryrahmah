export const MIN_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS = 30_000;
export const MAX_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS = 60_000;

export function resolveActivityHeartbeatSyncWindowMs(heartbeatMs: number) {
  const numericHeartbeatMs = Number(heartbeatMs);
  if (!Number.isFinite(numericHeartbeatMs) || numericHeartbeatMs <= 0) {
    return MIN_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS;
  }

  return Math.max(
    MIN_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS,
    Math.min(MAX_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS, Math.floor(numericHeartbeatMs / 2)),
  );
}

export function shouldSyncActivityHeartbeat(
  lastHeartbeatSyncAtMs: number,
  nowMs: number,
  syncWindowMs: number,
) {
  const normalizedNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const normalizedSyncWindowMs = Number.isFinite(syncWindowMs) && syncWindowMs > 0
    ? Math.floor(syncWindowMs)
    : MIN_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS;
  const normalizedLastHeartbeatSyncAtMs = Number.isFinite(lastHeartbeatSyncAtMs)
    ? lastHeartbeatSyncAtMs
    : 0;

  return normalizedLastHeartbeatSyncAtMs <= 0
    || normalizedNowMs - normalizedLastHeartbeatSyncAtMs >= normalizedSyncWindowMs;
}
