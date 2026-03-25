import {
  type CollectionRollupFreshnessSnapshot,
} from "../../repositories/collection-record-repository-utils";
import type { CollectionStoragePort } from "./collection-service-support";

export type CollectionReportFreshness = {
  status: CollectionRollupFreshnessSnapshot["status"];
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
  message: string;
};

function formatDuration(durationMs: number): string {
  const safeMs = Math.max(0, Math.round(Number(durationMs || 0)));
  if (safeMs >= 60_000) {
    const minutes = Math.floor(safeMs / 60_000);
    const seconds = Math.floor((safeMs % 60_000) / 1_000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  if (safeMs >= 1_000) {
    return `${Math.round(safeMs / 1_000)}s`;
  }
  return `${safeMs}ms`;
}

export function buildCollectionReportFreshnessMessage(snapshot: CollectionRollupFreshnessSnapshot): string {
  if (snapshot.status === "fresh") {
    return "Fresh: report rollups are up to date.";
  }

  const oldestAgeLabel = formatDuration(snapshot.oldestPendingAgeMs);
  const retryLabel = snapshot.retryCount > 0
    ? ` ${snapshot.retryCount} slice(s) need retry.`
    : "";

  if (snapshot.status === "warming") {
    return `Updating: ${snapshot.pendingCount} pending slice(s), ${snapshot.runningCount} running, oldest ${oldestAgeLabel}.${retryLabel}`;
  }

  return `Stale: ${snapshot.pendingCount} pending slice(s), oldest ${oldestAgeLabel}.${retryLabel}`;
}

function buildFreshFallbackSnapshot(): CollectionRollupFreshnessSnapshot {
  return {
    status: "fresh",
    pendingCount: 0,
    runningCount: 0,
    retryCount: 0,
    oldestPendingAgeMs: 0,
  };
}

export async function getCollectionReportFreshness(
  storage: Pick<CollectionStoragePort, "getCollectionRecordDailyRollupFreshness">,
  filters?: {
  from?: string;
  to?: string;
  createdByLogin?: string;
  nicknames?: string[];
}): Promise<CollectionReportFreshness> {
  const snapshot = typeof storage.getCollectionRecordDailyRollupFreshness === "function"
    ? await storage.getCollectionRecordDailyRollupFreshness(filters)
    : buildFreshFallbackSnapshot();
  return {
    status: snapshot.status,
    pendingCount: snapshot.pendingCount,
    runningCount: snapshot.runningCount,
    retryCount: snapshot.retryCount,
    oldestPendingAgeMs: snapshot.oldestPendingAgeMs,
    message: buildCollectionReportFreshnessMessage(snapshot),
  };
}
