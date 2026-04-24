type RateLimiterTopologyWarningOptions = {
  distributedStoreConfigured: boolean;
  workerCount: number;
};

export function buildRateLimiterTopologyWarning(
  options: RateLimiterTopologyWarningOptions,
): string | null {
  if (options.distributedStoreConfigured || options.workerCount <= 1) {
    return null;
  }

  return "Rate limiters currently use process-local in-memory storage. Multi-worker or multi-instance deployments require a shared store to enforce consistent limits across workers.";
}
