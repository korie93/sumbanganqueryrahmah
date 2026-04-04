import type { RollupFreshnessStatus } from "@/components/monitor/monitorData";

export type MonitorStatusNoticeSeverity = "warning" | "critical";

export type MonitorStatusNotice = {
  id: "mode" | "network" | "rollup";
  badge: string;
  title: string;
  message: string;
  severity: MonitorStatusNoticeSeverity;
};

export type MonitorStatusSummaryFact = {
  label: string;
  value: string;
  severity: MonitorStatusNoticeSeverity;
};

export function buildMonitorStatusNotices({
  mode,
  hasNetworkFailure,
  rollupFreshnessStatus,
  rollupFreshnessSummary,
}: {
  mode: string;
  hasNetworkFailure: boolean;
  rollupFreshnessStatus: RollupFreshnessStatus;
  rollupFreshnessSummary: string;
}) {
  const notices: MonitorStatusNotice[] = [];

  if (mode !== "NORMAL") {
    notices.push({
      id: "mode",
      badge: mode,
      title: "Protection mode active",
      message: `System is currently in ${mode} mode. Performance safeguards are active.`,
      severity: "critical",
    });
  }

  if (hasNetworkFailure) {
    notices.push({
      id: "network",
      badge: "Telemetry gap",
      title: "Partial telemetry unavailable",
      message: "Some monitor endpoints are unavailable right now. Showing the latest successful values until telemetry recovers.",
      severity: "warning",
    });
  }

  if (rollupFreshnessStatus !== "fresh") {
    notices.push({
      id: "rollup",
      badge: `Rollup ${rollupFreshnessStatus}`,
      title: rollupFreshnessStatus === "stale" ? "Rollup freshness breached" : "Rollup freshness warming",
      message: rollupFreshnessSummary,
      severity: rollupFreshnessStatus === "stale" ? "critical" : "warning",
    });
  }

  return notices;
}

export function resolveInitialMonitorStatusDetailsOpen({
  notices,
  isMobile,
}: {
  notices: MonitorStatusNotice[];
  isMobile: boolean;
}) {
  if (notices.length === 0) {
    return false;
  }

  return !isMobile && notices.some((notice) => notice.severity === "critical");
}

export function buildMonitorStatusSummaryFacts(notices: MonitorStatusNotice[]): MonitorStatusSummaryFact[] {
  const criticalCount = notices.filter((notice) => notice.severity === "critical").length;
  const warningCount = notices.length - criticalCount;
  const facts: MonitorStatusSummaryFact[] = [];

  if (criticalCount > 0) {
    facts.push({
      label: "Critical",
      value: String(criticalCount),
      severity: "critical",
    });
  }

  if (warningCount > 0) {
    facts.push({
      label: "Warning",
      value: String(warningCount),
      severity: "warning",
    });
  }

  return facts;
}

export function buildMonitorStatusHeadline(notices: MonitorStatusNotice[]) {
  const hasCriticalNotice = notices.some((notice) => notice.severity === "critical");
  return hasCriticalNotice ? "Immediate operator review needed" : "Operator review recommended";
}

export function buildMonitorStatusSummaryText(notices: MonitorStatusNotice[]) {
  if (notices.length === 0) {
    return "No active monitor notices.";
  }

  const criticalCount = notices.filter((notice) => notice.severity === "critical").length;
  const warningCount = notices.length - criticalCount;
  const parts: string[] = [];

  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical`);
  }

  if (warningCount > 0) {
    parts.push(`${warningCount} warning`);
  }

  return `${parts.join(" and ")} notice${notices.length === 1 ? "" : "s"} affecting live monitor visibility.`;
}
