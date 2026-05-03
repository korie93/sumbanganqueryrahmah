export function requiresSingleWorkerForProcessLocalTwoFactorReplayCache(workerCount: number) {
  const normalizedWorkerCount = Math.max(1, Math.trunc(Number(workerCount) || 0));
  return normalizedWorkerCount > 1;
}

export function buildTwoFactorReplayCacheTopologyWarning(workerCount: number) {
  if (!requiresSingleWorkerForProcessLocalTwoFactorReplayCache(workerCount)) {
    return null;
  }

  return "2FA TOTP replay protection is process-local. Multi-worker deployments should use one worker, sticky routing, or a shared replay store before enabling more than one worker.";
}
