export type CollectionRollupFreshnessStatus = "fresh" | "warming" | "stale";

export type CollectionRollupFreshnessSnapshot = {
  status: CollectionRollupFreshnessStatus;
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
  message: string;
};

export function getCollectionRollupFreshnessStatus(snapshot: Pick<
  CollectionRollupFreshnessSnapshot,
  "pendingCount" | "retryCount" | "oldestPendingAgeMs"
>): CollectionRollupFreshnessStatus {
  if (
    snapshot.retryCount > 0 ||
    snapshot.oldestPendingAgeMs >= 120_000 ||
    snapshot.pendingCount >= 15
  ) {
    return "stale";
  }

  if (
    snapshot.pendingCount > 0 ||
    snapshot.oldestPendingAgeMs >= 30_000
  ) {
    return "warming";
  }

  return "fresh";
}

export function getCollectionRollupFreshnessBadgeClass(status: CollectionRollupFreshnessStatus) {
  if (status === "fresh") return "border-emerald-500/30 bg-emerald-500/15 text-emerald-500";
  if (status === "warming") return "border-amber-500/30 bg-amber-500/15 text-amber-500";
  return "border-red-500/30 bg-red-500/15 text-red-500";
}
