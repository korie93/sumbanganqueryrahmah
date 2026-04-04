import type { MonitorAlert, MonitorPagination } from "@/lib/api";

export type MonitorAlertSummaryTone = "stable" | "watch" | "attention";

export type MonitorAlertSummaryFact = {
  label: string;
  value: string;
  tone: MonitorAlertSummaryTone;
};

export function buildMonitorAlertsCompactSummary({
  alerts,
  alertsPagination,
  alertHistoryPagination,
}: {
  alerts: MonitorAlert[];
  alertsPagination: MonitorPagination;
  alertHistoryPagination: MonitorPagination;
}) {
  const liveTotal = alertsPagination.totalItems;
  const historyTotal = alertHistoryPagination.totalItems;
  const visibleCriticalCount = alerts.filter((alert) => alert.severity === "CRITICAL").length;
  const visibleWarningCount = alerts.filter((alert) => alert.severity === "WARNING").length;

  if (liveTotal === 0 && historyTotal === 0) {
    return {
      tone: "stable" as const,
      badge: "Clear",
      headline: "No live incidents are open right now.",
      description: "Alert panels stay collapsed until operators need fresh incidents or older history.",
    };
  }

  if (liveTotal === 0) {
    return {
      tone: "stable" as const,
      badge: "History",
      headline: "Live incidents are clear, with older history still available.",
      description: `${historyTotal} historical record${historyTotal === 1 ? "" : "s"} remain available when you need resolved timelines or cleanup actions.`,
    };
  }

  if (visibleCriticalCount > 0) {
    return {
      tone: "attention" as const,
      badge: "Attention",
      headline: "Live incidents need operator review.",
      description: `${liveTotal} live incident${liveTotal === 1 ? "" : "s"} are open, with ${visibleCriticalCount} critical item${visibleCriticalCount === 1 ? "" : "s"} visible on this page.`,
    };
  }

  if (visibleWarningCount > 0) {
    return {
      tone: "watch" as const,
      badge: "Watch",
      headline: "Live incidents are open, but no critical items are visible on this page.",
      description: `${liveTotal} live incident${liveTotal === 1 ? "" : "s"} and ${historyTotal} history record${historyTotal === 1 ? "" : "s"} remain available for review.`,
    };
  }

  return {
    tone: "watch" as const,
    badge: "Live",
    headline: "Live informational incidents are still open.",
    description: `${liveTotal} live incident${liveTotal === 1 ? "" : "s"} are open, and deeper detail stays hidden until requested.`,
  };
}

export function buildMonitorAlertsSummaryFacts({
  alerts,
  alertsPagination,
  alertHistoryPagination,
}: {
  alerts: MonitorAlert[];
  alertsPagination: MonitorPagination;
  alertHistoryPagination: MonitorPagination;
}): MonitorAlertSummaryFact[] {
  const facts: MonitorAlertSummaryFact[] = [
    {
      label: "Live",
      value: String(alertsPagination.totalItems),
      tone: alertsPagination.totalItems > 0 ? "watch" : "stable",
    },
  ];

  if (alertHistoryPagination.totalItems > 0) {
    facts.push({
      label: "History",
      value: String(alertHistoryPagination.totalItems),
      tone: "stable",
    });
  }

  const visibleCriticalCount = alerts.filter((alert) => alert.severity === "CRITICAL").length;
  if (visibleCriticalCount > 0) {
    facts.push({
      label: "Critical visible",
      value: String(visibleCriticalCount),
      tone: "attention",
    });
    return facts;
  }

  const visibleWarningCount = alerts.filter((alert) => alert.severity === "WARNING").length;
  if (visibleWarningCount > 0) {
    facts.push({
      label: "Warning visible",
      value: String(visibleWarningCount),
      tone: "watch",
    });
  }

  return facts;
}
