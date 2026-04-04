import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";

export type MonitorMetricsSummaryTone = "stable" | "watch" | "attention";

export type MonitorMetricsSummaryFact = {
  label: string;
  value: string;
  tone: MonitorMetricsSummaryTone;
};

function toLabel(tone: MonitorMetricsSummaryTone) {
  if (tone === "attention") {
    return "Attention";
  }

  if (tone === "watch") {
    return "Watch";
  }

  return "Healthy";
}

function resolveInfrastructureTone(snapshot: MonitorSnapshot): MonitorMetricsSummaryTone {
  if (snapshot.cpuPercent >= 85 || snapshot.ramPercent >= 85 || snapshot.eventLoopLagMs >= 60) {
    return "attention";
  }

  if (snapshot.cpuPercent >= 70 || snapshot.ramPercent >= 75 || snapshot.eventLoopLagMs >= 30) {
    return "watch";
  }

  return "stable";
}

function resolveApplicationTone(snapshot: MonitorSnapshot): MonitorMetricsSummaryTone {
  if (snapshot.p95LatencyMs >= 900 || snapshot.errorRate >= 2 || snapshot.activeAlertCount >= 3) {
    return "attention";
  }

  if (snapshot.p95LatencyMs >= 450 || snapshot.errorRate >= 1 || snapshot.activeAlertCount > 0) {
    return "watch";
  }

  return "stable";
}

function resolveDatabaseTone(snapshot: MonitorSnapshot): MonitorMetricsSummaryTone {
  if (snapshot.avgQueryTimeMs >= 900 || snapshot.slowQueryCount >= 10) {
    return "attention";
  }

  if (snapshot.avgQueryTimeMs >= 300 || snapshot.slowQueryCount > 0) {
    return "watch";
  }

  return "stable";
}

function resolveAiTone(snapshot: MonitorSnapshot): MonitorMetricsSummaryTone {
  if (snapshot.aiLatencyMs >= 1200 || snapshot.aiFailRate >= 2) {
    return "attention";
  }

  if (snapshot.aiLatencyMs >= 600 || snapshot.aiFailRate >= 0.5) {
    return "watch";
  }

  return "stable";
}

export function buildMonitorMetricsSummaryFacts(snapshot: MonitorSnapshot): MonitorMetricsSummaryFact[] {
  const infrastructureTone = resolveInfrastructureTone(snapshot);
  const applicationTone = resolveApplicationTone(snapshot);
  const databaseTone = resolveDatabaseTone(snapshot);
  const aiTone = resolveAiTone(snapshot);

  return [
    {
      label: "Infra",
      value: toLabel(infrastructureTone),
      tone: infrastructureTone,
    },
    {
      label: "App",
      value: toLabel(applicationTone),
      tone: applicationTone,
    },
    {
      label: "DB",
      value: toLabel(databaseTone),
      tone: databaseTone,
    },
    {
      label: "AI",
      value: toLabel(aiTone),
      tone: aiTone,
    },
  ];
}

export function buildMonitorMetricsCompactSummary(snapshot: MonitorSnapshot) {
  const facts = buildMonitorMetricsSummaryFacts(snapshot);
  const attentionCount = facts.filter((fact) => fact.tone === "attention").length;
  const watchCount = facts.filter((fact) => fact.tone === "watch").length;

  if (attentionCount > 0) {
    return {
      tone: "attention" as const,
      badge: "Attention",
      headline: "One or more KPI layers need closer operator review.",
      description: `${attentionCount} layer${attentionCount === 1 ? "" : "s"} are in attention and ${watchCount} remain on watch before you open the grouped panels.`,
    };
  }

  if (watchCount > 0) {
    return {
      tone: "watch" as const,
      badge: "Watch",
      headline: "Core KPI layers show a few signals worth watching.",
      description: `${watchCount} layer${watchCount === 1 ? "" : "s"} are elevated while the remaining groups stay healthy.`,
    };
  }

  return {
    tone: "stable" as const,
    badge: "Healthy",
    headline: "Core KPI layers are staying within current thresholds.",
    description: "Infrastructure, application, database, and AI groups remain healthy until deeper detail is requested.",
  };
}
