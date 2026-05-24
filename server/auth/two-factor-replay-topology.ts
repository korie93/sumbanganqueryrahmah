export function requiresSingleWorkerForProcessLocalTwoFactorReplayCache(workerCount: number) {
  const normalizedWorkerCount = Math.max(1, Math.trunc(Number(workerCount) || 0));
  return normalizedWorkerCount > 1;
}

export function buildTwoFactorReplayCacheTopologyWarning(
  workerCount: number,
  sharedReplayStoreConfigured = false,
) {
  if (
    sharedReplayStoreConfigured
    || !requiresSingleWorkerForProcessLocalTwoFactorReplayCache(workerCount)
  ) {
    return null;
  }

  return "2FA TOTP replay protection is process-local. Multi-worker deployments must use one worker unless Redis-backed shared replay protection is configured.";
}

export function assertProductionTwoFactorReplayCacheTopologySafety(params: {
  isProductionLike: boolean;
  sharedReplayStoreConfigured: boolean;
  workerCount: number;
}) {
  if (
    !params.isProductionLike
    || params.sharedReplayStoreConfigured
    || !requiresSingleWorkerForProcessLocalTwoFactorReplayCache(params.workerCount)
  ) {
    return;
  }

  throw new Error(
    "SQR_MAX_WORKERS greater than 1 is not allowed on production-like hosts while 2FA TOTP replay protection is process-local. Set SQR_MAX_WORKERS=1 or configure SQR_RATE_LIMIT_STORE=redis with SQR_REDIS_RATE_LIMIT_URL so replay protection is shared.",
  );
}
