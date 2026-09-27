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
  if (status === "fresh") return "border-success/30 bg-success/10 text-success";
  if (status === "warming") return "border-warning/30 bg-warning/10 text-warning";
  return "border-destructive/30 bg-destructive/10 text-destructive";
}
