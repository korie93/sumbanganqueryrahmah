import type { MetricStatus, MetricTrend } from "@/components/monitor/MetricPanel";
import type {
  MonitorRollupSnapshot,
  MonitorRollupSummarySnapshot,
} from "@/components/monitor/monitor-types";
import {
  getCollectionRollupFreshnessBadgeClass as getSharedCollectionRollupFreshnessBadgeClass,
  getCollectionRollupFreshnessStatus as getSharedCollectionRollupFreshnessStatus,
  type CollectionRollupFreshnessStatus as SharedCollectionRollupFreshnessStatus,
} from "@/lib/collection-rollup-freshness";

export type RollupFreshnessStatus = SharedCollectionRollupFreshnessStatus;

export const getTrend = (values: number[]): MetricTrend => {
  if (values.length < 2) return "neutral";
  const previous = values[values.length - 2];
  const current = values[values.length - 1];
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "neutral";
};

export const getStatus = (value: number, warning: number, critical: number, inverse = false): MetricStatus => {
  if (!Number.isFinite(value)) return "warning";
  if (!inverse) {
    if (value >= critical) return "critical";
    if (value >= warning) return "warning";
    return "good";
  }
  if (value <= critical) return "critical";
  if (value <= warning) return "warning";
  return "good";
};

const LEGACY_ARROW_SEQUENCE = "\u00e2\u2020\u201d";
const UNICODE_ARROW_SEQUENCE = "\u2194";

const buildBoostedPattern = (prefix: string) =>
  new RegExp(`${prefix}(?:${LEGACY_ARROW_SEQUENCE}|${UNICODE_ARROW_SEQUENCE})`, "g");

const CPU_BOOSTED_PATTERN = buildBoostedPattern("CPU");
const DB_BOOSTED_PATTERN = buildBoostedPattern("DB_LATENCY");
const AI_BOOSTED_PATTERN = buildBoostedPattern("AI_LATENCY");

export const normalizeBoostedKey = (value: string) =>
  value
    .replace(CPU_BOOSTED_PATTERN, "CPU<->")
    .replace(DB_BOOSTED_PATTERN, "DB_LATENCY<->")
    .replace(AI_BOOSTED_PATTERN, "AI_LATENCY<->");

export const toTitleLabel = (value: string) =>
  value
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());

export const getScoreStatus = (score: number): MetricStatus => {
  if (score >= 85) return "good";
  if (score >= 60) return "warning";
  return "critical";
};

export const getModeBadgeClass = (mode: string) => {
  if (mode === "NORMAL") return "border-emerald-500/30 bg-emerald-500/15 text-emerald-500";
  if (mode === "DEGRADED") return "border-amber-500/30 bg-amber-500/15 text-amber-500";
  return "border-red-500/30 bg-red-500/15 text-red-500";
};

export const getRollupFreshnessStatus = (
  snapshot: MonitorRollupSnapshot,
): RollupFreshnessStatus =>
  getSharedCollectionRollupFreshnessStatus({
    pendingCount: snapshot.rollupRefreshPendingCount,
    retryCount: snapshot.rollupRefreshRetryCount,
    oldestPendingAgeMs: snapshot.rollupRefreshOldestPendingAgeMs,
  });

export const getRollupFreshnessBadgeClass = (status: RollupFreshnessStatus) =>
  getSharedCollectionRollupFreshnessBadgeClass(status);

export const formatMonitorDurationCompact = (durationMs: number) => {
  const safeMs = Math.max(0, Math.round(Number(durationMs || 0)));
  if (safeMs >= 3_600_000) {
    const hours = Math.floor(safeMs / 3_600_000);
    const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (safeMs >= 60_000) {
    const minutes = Math.floor(safeMs / 60_000);
    const seconds = Math.floor((safeMs % 60_000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  if (safeMs >= 1000) {
    return `${(safeMs / 1000).toFixed(safeMs >= 10_000 ? 0 : 1)}s`;
  }
  return `${safeMs}ms`;
};

export const buildRollupFreshnessSummary = (snapshot: MonitorRollupSummarySnapshot) => {
  const status = getRollupFreshnessStatus(snapshot);
  if (status === "fresh") {
    return "Fresh: collection report rollups are keeping up with current mutations.";
  }

  const oldestAge = formatMonitorDurationCompact(snapshot.rollupRefreshOldestPendingAgeMs);
  const retryText = snapshot.rollupRefreshRetryCount > 0
    ? ` ${snapshot.rollupRefreshRetryCount} slice(s) waiting to retry.`
    : "";

  if (status === "warming") {
    return `Warming: ${snapshot.rollupRefreshPendingCount} pending slice(s), ${snapshot.rollupRefreshRunningCount} running, oldest ${oldestAge}.${retryText}`;
  }

  return `Stale: ${snapshot.rollupRefreshPendingCount} pending slice(s), oldest ${oldestAge}.${retryText}`;
};

export const getGovernanceClass = (governanceState: string) => {
  if (governanceState === "LOCKDOWN" || governanceState === "FAIL_SAFE") {
    return "border-red-500/35 bg-red-500/15 text-red-500";
  }
  if (governanceState === "COOLDOWN" || governanceState === "CONSENSUS_PENDING") {
    return "border-amber-500/35 bg-amber-500/15 text-amber-500";
  }
  return "border-emerald-500/35 bg-emerald-500/15 text-emerald-500";
};
