export function requiresSingleWorkerForProcessLocalWebSocketState(workerCount: number) {
  const normalizedWorkerCount = Math.max(1, Math.trunc(Number(workerCount) || 0));
  return normalizedWorkerCount > 1;
}

export function buildWebSocketTopologyWarning(workerCount: number) {
  if (!requiresSingleWorkerForProcessLocalWebSocketState(workerCount)) {
    return null;
  }

  return "WebSocket connection state is process-local. Keep SQR_MAX_WORKERS=1 until Redis pub/sub or another shared fan-out/presence layer can propagate broadcast, force-logout, idle-close, and presence invalidation events across workers.";
}
