export function requiresSingleWorkerForProcessLocalWebSocketState(workerCount: number) {
  const normalizedWorkerCount = Math.max(1, Math.trunc(Number(workerCount) || 0));
  return normalizedWorkerCount > 1;
}

export function buildWebSocketTopologyWarning(workerCount: number) {
  if (!requiresSingleWorkerForProcessLocalWebSocketState(workerCount)) {
    return null;
  }

  return "WebSocket connection state is process-local. Multi-worker deployments should use one worker, sticky routing, or a shared fan-out/presence layer before enabling more than one worker.";
}
