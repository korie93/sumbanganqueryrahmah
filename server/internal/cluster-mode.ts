export function shouldUseSingleProcessMode(options: {
  maxWorkers: number;
  forceCluster?: string | undefined;
}) {
  const maxWorkers = Number.isFinite(options.maxWorkers)
    ? Math.max(1, Math.trunc(options.maxWorkers))
    : 1;
  const forceCluster = String(options.forceCluster || "").trim().toLowerCase();

  if (forceCluster === "1" || forceCluster === "true" || forceCluster === "yes") {
    return false;
  }

  return maxWorkers <= 1;
}

export function resolveSafeClusterWorkerTopology(options: {
  requestedMaxWorkers: number;
  sharedRuntimeStateConfigured?: boolean | undefined;
  sharedRuntimeStateEnabled?: boolean | undefined;
}) {
  const requestedMaxWorkers = Number.isFinite(options.requestedMaxWorkers)
    ? Math.max(1, Math.trunc(options.requestedMaxWorkers))
    : 1;
  const sharedRuntimeStateConfigured = options.sharedRuntimeStateConfigured === true;
  const sharedRuntimeStateEnabled = options.sharedRuntimeStateEnabled === true;

  if (requestedMaxWorkers <= 1 || sharedRuntimeStateEnabled) {
    return {
      downgradedToSingleWorker: false,
      maxWorkers: requestedMaxWorkers,
      requestedMaxWorkers,
      reason: null,
    };
  }

  return {
    downgradedToSingleWorker: true,
    maxWorkers: 1,
    requestedMaxWorkers,
    reason: sharedRuntimeStateConfigured
      ? "shared-runtime-state-adapters-disabled"
      : "process-local-security-state",
  };
}

export function resolveProcessLocalSecurityWorkerCount(options: {
  requestedMaxWorkers: number;
  sharedRuntimeStateConfigured?: boolean | undefined;
}) {
  return resolveSafeClusterWorkerTopology({
    requestedMaxWorkers: options.requestedMaxWorkers,
    sharedRuntimeStateConfigured: options.sharedRuntimeStateConfigured,
    sharedRuntimeStateEnabled: false,
  }).maxWorkers;
}

export function normalizeInitialWorkerCount(options: {
  maxWorkers: number;
  initialWorkers: number;
}) {
  const maxWorkers = Number.isFinite(options.maxWorkers)
    ? Math.max(1, Math.trunc(options.maxWorkers))
    : 1;
  const initialWorkers = Number.isFinite(options.initialWorkers)
    ? Math.max(1, Math.trunc(options.initialWorkers))
    : 1;

  return Math.min(maxWorkers, initialWorkers);
}
