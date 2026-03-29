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
