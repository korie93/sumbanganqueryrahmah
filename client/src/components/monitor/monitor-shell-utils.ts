import type { RollupFreshnessStatus } from "@/components/monitor/monitorData";
import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";

export type MonitorShellFact = {
  label: string;
  value: string;
  tone: "stable" | "watch" | "attention";
};

type BuildMonitorShellDescriptionOptions = {
  hasNetworkFailure: boolean;
  isLoading: boolean;
  updatedLabel: string;
};

type BuildMonitorShellFactsOptions = {
  snapshot: MonitorSnapshot;
  rollupFreshnessStatus: RollupFreshnessStatus;
  updatedLabel: string;
};

function getModeTone(mode: string): MonitorShellFact["tone"] {
  if (mode === "NORMAL") return "stable";
  if (mode === "DEGRADED") return "watch";
  return "attention";
}

function getScoreTone(score: number): MonitorShellFact["tone"] {
  if (score >= 85) return "stable";
  if (score >= 60) return "watch";
  return "attention";
}

function getRollupTone(status: RollupFreshnessStatus): MonitorShellFact["tone"] {
  if (status === "fresh") return "stable";
  if (status === "warming") return "watch";
  return "attention";
}

function getRollupLabel(status: RollupFreshnessStatus) {
  return status === "fresh" ? "Fresh" : status === "warming" ? "Warming" : "Stale";
}

export function buildMonitorShellDescription({
  hasNetworkFailure,
  isLoading,
  updatedLabel,
}: BuildMonitorShellDescriptionOptions) {
  if (hasNetworkFailure) {
    return "Runtime, alert, and rollup signals are still visible, but some cards may be showing the latest cached snapshot while connectivity recovers.";
  }

  if (isLoading && updatedLabel === "-") {
    return "Loading runtime, alert, and rollup signals for operators and admins.";
  }

  return updatedLabel === "-"
    ? "Live runtime, alert, and rollup signals for operators and admins."
    : `Live runtime, alert, and rollup signals. Last updated at ${updatedLabel}.`;
}

export function buildMonitorShellFacts({
  snapshot,
  rollupFreshnessStatus,
  updatedLabel,
}: BuildMonitorShellFactsOptions): MonitorShellFact[] {
  return [
    {
      label: "Mode",
      value: snapshot.mode,
      tone: getModeTone(snapshot.mode),
    },
    {
      label: "Score",
      value: `${Math.round(snapshot.score)}`,
      tone: getScoreTone(snapshot.score),
    },
    {
      label: "Rollup",
      value: getRollupLabel(rollupFreshnessStatus),
      tone: getRollupTone(rollupFreshnessStatus),
    },
    {
      label: "Updated",
      value: updatedLabel,
      tone: updatedLabel === "-" ? "watch" : "stable",
    },
  ];
}
