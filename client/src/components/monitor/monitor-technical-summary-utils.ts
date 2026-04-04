import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";

export type MonitorTechnicalSummaryTone = "stable" | "watch" | "attention";

export type MonitorTechnicalSummaryFact = {
  label: string;
  value: string;
  tone: MonitorTechnicalSummaryTone;
};

type MonitorTechnicalSignal = {
  label: string;
  value: number;
  unit: string;
  warning: number;
  critical: number;
};

function getTechnicalSignals(snapshot: MonitorSnapshot): MonitorTechnicalSignal[] {
  return [
    {
      label: "CPU",
      value: snapshot.cpuPercent,
      unit: "%",
      warning: 70,
      critical: 85,
    },
    {
      label: "p95",
      value: snapshot.p95LatencyMs,
      unit: "ms",
      warning: 450,
      critical: 900,
    },
    {
      label: "DB",
      value: snapshot.avgQueryTimeMs,
      unit: "ms",
      warning: 300,
      critical: 900,
    },
    {
      label: "AI",
      value: snapshot.aiLatencyMs,
      unit: "ms",
      warning: 600,
      critical: 1200,
    },
  ];
}

function getSignalTone(signal: MonitorTechnicalSignal): MonitorTechnicalSummaryTone {
  if (signal.value >= signal.critical) {
    return "attention";
  }

  if (signal.value >= signal.warning) {
    return "watch";
  }

  return "stable";
}

function formatSignalValue(signal: MonitorTechnicalSignal) {
  return `${Math.round(signal.value)}${signal.unit}`;
}

export function buildMonitorTechnicalCompactSummary(snapshot: MonitorSnapshot) {
  const signals = getTechnicalSignals(snapshot);
  const attentionSignals = signals.filter((signal) => getSignalTone(signal) === "attention");
  const watchSignals = signals.filter((signal) => getSignalTone(signal) === "watch");

  if (attentionSignals.length > 0) {
    return {
      tone: "attention" as const,
      badge: "Attention",
      headline: `${attentionSignals[0].label} trends deserve closer technical diagnosis.`,
      description: `${attentionSignals.length} core runtime signal${attentionSignals.length === 1 ? "" : "s"} crossed the current attention threshold. Open detailed charts only when you need deeper time-series context.`,
    };
  }

  if (watchSignals.length > 0) {
    return {
      tone: "watch" as const,
      badge: "Watch",
      headline: "Technical trends are mostly steady, with a few signals worth watching.",
      description: `${watchSignals.length} core runtime signal${watchSignals.length === 1 ? "" : "s"} are in the watch range, while the full chart grid stays hidden until requested.`,
    };
  }

  return {
    tone: "stable" as const,
    badge: "Healthy",
    headline: "Runtime, database, and AI signals are within current technical thresholds.",
    description: "Detailed chart groups remain collapsed by default so operators only load deeper diagnostics when they need them.",
  };
}

export function buildMonitorTechnicalSummaryFacts(snapshot: MonitorSnapshot): MonitorTechnicalSummaryFact[] {
  return getTechnicalSignals(snapshot).map((signal) => ({
    label: signal.label,
    value: formatSignalValue(signal),
    tone: getSignalTone(signal),
  }));
}
