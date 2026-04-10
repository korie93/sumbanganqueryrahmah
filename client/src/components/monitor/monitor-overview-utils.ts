import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";
import { isMobileViewportWidth } from "@/lib/responsive";

export function resolveInitialMonitorOverviewExpanded(width: number | undefined) {
  return !isMobileViewportWidth(width);
}

export function isMonitorOverviewStable(snapshot: MonitorSnapshot) {
  return (
    snapshot.mode === "NORMAL" &&
    snapshot.score >= 90 &&
    snapshot.activeAlertCount === 0 &&
    snapshot.rollupRefreshPendingCount === 0 &&
    snapshot.rollupRefreshRetryCount === 0
  );
}

export function buildMonitorOverviewCompactSummary(
  snapshot: MonitorSnapshot,
  rollupFreshnessAgeLabel: string,
) {
  if (isMonitorOverviewStable(snapshot)) {
    return {
      tone: "stable" as const,
      badge: "Stable",
      headline: "All core signals are within current thresholds.",
      description: `Workers are steady, alerts are clear, and the oldest rollup age is ${rollupFreshnessAgeLabel}.`,
    };
  }

  if (snapshot.activeAlertCount > 0 || snapshot.mode !== "NORMAL") {
    return {
      tone: "attention" as const,
      badge: "Attention",
      headline: "Operator review is recommended before expanding the full grid.",
      description: `${snapshot.activeAlertCount} live alerts and ${snapshot.mode} mode may need a closer look.`,
    };
  }

  return {
    tone: "watch" as const,
    badge: "Watch",
    headline: "Core systems are running, with some background pressure still visible.",
    description: `${snapshot.rollupRefreshPendingCount} rollup tasks are pending and the oldest item is ${rollupFreshnessAgeLabel}.`,
  };
}

export function buildMonitorOverviewCompactItems(
  snapshot: MonitorSnapshot,
  rollupFreshnessAgeLabel: string,
) {
  return [
    {
      label: "Mode",
      value: snapshot.mode,
    },
    {
      label: "Bottleneck",
      value: snapshot.bottleneckType || "Stable",
    },
    {
      label: "Workers",
      value: `${snapshot.workerCount}/${snapshot.maxWorkers}`,
    },
    {
      label: "Queue",
      value: `${snapshot.rollupRefreshPendingCount} pending`,
    },
    {
      label: "Alerts",
      value: String(snapshot.activeAlertCount),
    },
    {
      label: "Oldest",
      value: rollupFreshnessAgeLabel,
    },
  ];
}
