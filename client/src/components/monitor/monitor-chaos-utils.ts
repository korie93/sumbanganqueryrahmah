import { formatMonitorDurationCompact } from "@/components/monitor/monitorData";
import type { ChaosOption } from "@/components/monitor/monitorData";

export type MonitorChaosSummaryTone = "stable" | "watch" | "attention";

export type MonitorChaosSummaryFact = {
  label: string;
  value: string;
  tone: MonitorChaosSummaryTone;
};

function resolveChaosDurationLabel(chaosDurationMs: string, selectedChaosProfile: ChaosOption) {
  const parsedDuration = Number(chaosDurationMs);
  const durationMs =
    Number.isFinite(parsedDuration) && parsedDuration > 0
      ? parsedDuration
      : selectedChaosProfile.defaultDurationMs;

  return formatMonitorDurationCompact(durationMs);
}

export function buildMonitorChaosCompactSummary({
  canInjectChaos,
  selectedChaosProfile,
  chaosDurationMs,
  chaosLoading,
  lastChaosMessage,
}: {
  canInjectChaos: boolean;
  selectedChaosProfile: ChaosOption;
  chaosDurationMs: string;
  chaosLoading: boolean;
  lastChaosMessage: string | null;
}) {
  const durationLabel = resolveChaosDurationLabel(chaosDurationMs, selectedChaosProfile);

  if (!canInjectChaos) {
    return {
      tone: "watch" as const,
      badge: "Restricted",
      headline: "Fault-injection controls are limited to privileged operators.",
      description: `The current scenario profile remains visible for context, with ${selectedChaosProfile.label} prepared for ${durationLabel} when privileged access is available.`,
    };
  }

  if (chaosLoading) {
    return {
      tone: "attention" as const,
      badge: "Running",
      headline: `${selectedChaosProfile.label} is currently being injected.`,
      description: `The active scenario is set for ${durationLabel}. Controls stay hidden until operators need to adjust or review the next run.`,
    };
  }

  if (lastChaosMessage) {
    return {
      tone: "stable" as const,
      badge: "Ready",
      headline: "The last resilience scenario completed and the lab is ready again.",
      description: `The default profile remains ${selectedChaosProfile.label} for ${durationLabel}, while detailed controls stay tucked away until requested.`,
    };
  }

  return {
    tone: "stable" as const,
    badge: "Ready",
    headline: "Fault-injection controls stay hidden until requested.",
    description: `The current default profile is ${selectedChaosProfile.label} for ${durationLabel}, without loading the full scenario form upfront.`,
  };
}

export function buildMonitorChaosSummaryFacts({
  canInjectChaos,
  selectedChaosProfile,
  chaosDurationMs,
  chaosLoading,
}: {
  canInjectChaos: boolean;
  selectedChaosProfile: ChaosOption;
  chaosDurationMs: string;
  chaosLoading: boolean;
}): MonitorChaosSummaryFact[] {
  const facts: MonitorChaosSummaryFact[] = [
    {
      label: "Access",
      value: canInjectChaos ? "Ready" : "Restricted",
      tone: canInjectChaos ? "stable" : "watch",
    },
    {
      label: "Scenario",
      value: selectedChaosProfile.label,
      tone: canInjectChaos ? "stable" : "watch",
    },
    {
      label: "Duration",
      value: resolveChaosDurationLabel(chaosDurationMs, selectedChaosProfile),
      tone: "stable",
    },
  ];

  if (chaosLoading) {
    facts.push({
      label: "Status",
      value: "Running",
      tone: "attention",
    });
  }

  return facts;
}
