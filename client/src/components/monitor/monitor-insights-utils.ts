import type { IntelligenceExplainPayload } from "@/lib/api";
import { isMobileViewportWidth } from "@/lib/responsive";

type MonitorInsightsBadge = {
  label: string;
  value: string;
};

type MonitorInsightsInitialOpenState = {
  summaryOpen: boolean;
  explainabilityOpen: boolean;
  forecastOpen: boolean;
};

export type MonitorInsightsSummaryTone = "stable" | "watch" | "attention";

export type MonitorInsightsSummaryFact = {
  label: string;
  value: string;
  tone: MonitorInsightsSummaryTone;
};

function formatStrategyAction(action: IntelligenceExplainPayload["chosenStrategy"]["recommendedAction"]) {
  switch (action) {
    case "ENABLE_THROTTLE_MODE":
      return "Throttle";
    case "PAUSE_AI_QUEUE":
      return "Pause AI";
    case "REDUCE_WORKER_COUNT":
      return "Reduce Workers";
    case "SELECTIVE_WORKER_RESTART":
      return "Restart Workers";
    default:
      return "No Action";
  }
}

function formatGovernanceStateLabel(state: IntelligenceExplainPayload["governanceState"]) {
  switch (state) {
    case "CONSENSUS_PENDING":
      return "Consensus";
    case "FAIL_SAFE":
      return "Fail-safe";
    default:
      return state
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

function resolveGovernanceTone(state: IntelligenceExplainPayload["governanceState"]): MonitorInsightsSummaryTone {
  if (state === "LOCKDOWN" || state === "FAIL_SAFE") {
    return "attention";
  }

  if (state === "PROPOSED" || state === "CONSENSUS_PENDING" || state === "EXECUTED" || state === "COOLDOWN") {
    return "watch";
  }

  return "stable";
}

function resolveActionTone(
  action: IntelligenceExplainPayload["chosenStrategy"]["recommendedAction"],
): MonitorInsightsSummaryTone {
  if (action === "PAUSE_AI_QUEUE" || action === "SELECTIVE_WORKER_RESTART") {
    return "attention";
  }

  if (action === "ENABLE_THROTTLE_MODE" || action === "REDUCE_WORKER_COUNT") {
    return "watch";
  }

  return "stable";
}

export function resolveInitialMonitorInsightsOpenState(
  width?: number,
): MonitorInsightsInitialOpenState {
  const isCompactViewport = isMobileViewportWidth(width);

  if (isCompactViewport) {
    return {
      summaryOpen: false,
      explainabilityOpen: false,
      forecastOpen: false,
    };
  }

  return {
    summaryOpen: true,
    explainabilityOpen: false,
    forecastOpen: false,
  };
}

export function buildMonitorInsightsDecisionSummaryBadges(
  intelligence: IntelligenceExplainPayload,
): MonitorInsightsBadge[] {
  return [
    {
      label: "State",
      value: intelligence.governanceState,
    },
    {
      label: "Strategy",
      value: intelligence.chosenStrategy.strategy,
    },
    {
      label: "Action",
      value: formatStrategyAction(intelligence.chosenStrategy.recommendedAction),
    },
    {
      label: "Confidence",
      value: `${(intelligence.chosenStrategy.confidenceScore * 100).toFixed(1)}%`,
    },
  ];
}

export function buildMonitorInsightsExplainabilityBadges(
  intelligence: IntelligenceExplainPayload,
): MonitorInsightsBadge[] {
  return [
    {
      label: "Signals",
      value: String(Object.keys(intelligence.anomalyBreakdown).length),
    },
    {
      label: "Boosted",
      value: String(intelligence.correlationMatrix.boostedPairs.length),
    },
    {
      label: "Slopes",
      value: String(Object.keys(intelligence.slopeValues).length),
    },
  ];
}

export function buildMonitorInsightsForecastBadges(
  intelligence: IntelligenceExplainPayload,
): MonitorInsightsBadge[] {
  const projection = intelligence.forecastProjection;
  const peakValue = projection.length > 0 ? Math.max(...projection) : 0;
  const lastValue = projection.length > 0 ? projection[projection.length - 1] : 0;

  return [
    {
      label: "Points",
      value: String(projection.length),
    },
    {
      label: "Peak",
      value: `${peakValue.toFixed(0)}ms`,
    },
    {
      label: "Latest",
      value: `${lastValue.toFixed(0)}ms`,
    },
  ];
}

export function buildMonitorInsightsCompactSummary(intelligence: IntelligenceExplainPayload) {
  const governanceLabel = formatGovernanceStateLabel(intelligence.governanceState);
  const actionLabel = formatStrategyAction(intelligence.chosenStrategy.recommendedAction);
  const governanceTone = resolveGovernanceTone(intelligence.governanceState);
  const actionTone = resolveActionTone(intelligence.chosenStrategy.recommendedAction);

  if (governanceTone === "attention" || actionTone === "attention") {
    return {
      tone: "attention" as const,
      badge: "Attention",
      headline: "Automated decisioning is in an escalated state.",
      description: `${governanceLabel} governance and ${actionLabel.toLowerCase()} guidance should be reviewed before opening deeper explainability panels.`,
    };
  }

  if (governanceTone === "stable" && actionTone === "stable") {
    return {
      tone: "stable" as const,
      badge: "Healthy",
      headline: "Decisioning is calm and no active intervention is recommended.",
      description: "Explainability, forecast, and correlation detail stay hidden until an operator requests them.",
    };
  }

  return {
    tone: "watch" as const,
    badge: "Watch",
    headline: "Decisioning is active, with deeper explainability available on demand.",
    description: `${governanceLabel} governance is paired with ${actionLabel.toLowerCase()} guidance at ${(intelligence.chosenStrategy.confidenceScore * 100).toFixed(1)}% confidence.`,
  };
}

export function buildMonitorInsightsSummaryFacts(
  intelligence: IntelligenceExplainPayload,
): MonitorInsightsSummaryFact[] {
  const confidence = intelligence.chosenStrategy.confidenceScore;

  return [
    {
      label: "State",
      value: formatGovernanceStateLabel(intelligence.governanceState),
      tone: resolveGovernanceTone(intelligence.governanceState),
    },
    {
      label: "Action",
      value: formatStrategyAction(intelligence.chosenStrategy.recommendedAction),
      tone: resolveActionTone(intelligence.chosenStrategy.recommendedAction),
    },
    {
      label: "Boosted",
      value: String(intelligence.correlationMatrix.boostedPairs.length),
      tone: intelligence.correlationMatrix.boostedPairs.length > 0 ? "watch" : "stable",
    },
    {
      label: "Confidence",
      value: `${(confidence * 100).toFixed(1)}%`,
      tone: confidence >= 0.75 ? "stable" : confidence >= 0.5 ? "watch" : "attention",
    },
  ];
}
