export function requiresSingleWorkerForProcessLocalWebSocketState(
  workerCount: number,
  sharedBusConfigured = false,
) {
  const normalizedWorkerCount = Math.max(1, Math.trunc(Number(workerCount) || 0));
  return normalizedWorkerCount > 1 && !sharedBusConfigured;
}

export function buildWebSocketTopologyWarning(workerCount: number, sharedBusConfigured = false) {
  if (!requiresSingleWorkerForProcessLocalWebSocketState(workerCount, sharedBusConfigured)) {
    return null;
  }

  return "WebSocket connection state is process-local. Keep SQR_MAX_WORKERS=1 until Redis pub/sub or another shared fan-out layer can propagate broadcast, force-logout, idle-close, and presence invalidation events across workers.";
}

export function assertProductionWebSocketTopologySafety(params: {
  isProductionLike: boolean;
  sharedBusConfigured: boolean;
  workerCount: number;
}) {
  if (
    !params.isProductionLike
    || !requiresSingleWorkerForProcessLocalWebSocketState(params.workerCount, params.sharedBusConfigured)
  ) {
    return;
  }

  throw new Error(
    "SQR_MAX_WORKERS greater than 1 is not allowed on production-like hosts while WebSocket fan-out is process-local. Set SQR_MAX_WORKERS=1 or configure SQR_WS_SHARED_BUS=redis with a reachable Redis URL before enabling multi-worker mode.",
  );
}
