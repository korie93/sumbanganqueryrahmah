import type { IntelligenceExplainPayload } from "@/lib/api";
import type {
  AnomalyRow,
  CorrelationRow,
  SlopeRow,
} from "@/components/monitor/monitor-types";
import { toTitleLabel } from "@/components/monitor/monitor-format-utils";

export function buildAnomalyRows(intelligence: IntelligenceExplainPayload): AnomalyRow[] {
  return [
    { label: "Normalized Z-Score", key: "normalizedZScore", value: intelligence.anomalyBreakdown.normalizedZScore, description: "Distance from baseline behavior after normalization." },
    { label: "Slope Weight", key: "slopeWeight", value: intelligence.anomalyBreakdown.slopeWeight, description: "Trend acceleration impact from linear slope analysis." },
    { label: "Percentile Shift", key: "percentileShift", value: intelligence.anomalyBreakdown.percentileShift, description: "Shift against historical percentile position." },
    { label: "Correlation Weight", key: "correlationWeight", value: intelligence.anomalyBreakdown.correlationWeight, description: "Boost from cross-metric correlation detection." },
    { label: "Forecast Risk", key: "forecastRisk", value: intelligence.anomalyBreakdown.forecastRisk, description: "Predicted near-term instability contribution." },
    { label: "Mutation Factor", key: "mutationFactor", value: intelligence.anomalyBreakdown.mutationFactor, description: "Adaptive reduction factor from repeated stability signatures." },
    { label: "Weighted Score", key: "weightedScore", value: intelligence.anomalyBreakdown.weightedScore, description: "Final weighted anomaly score used in decision flow." },
  ];
}

export function buildCorrelationRows(intelligence: IntelligenceExplainPayload): CorrelationRow[] {
  return [
    { label: "CPU to Latency", value: intelligence.correlationMatrix.cpuToLatency, key: "cpu_to_latency", boostedKey: "CPU<->P95_LATENCY", description: "Relationship between CPU load and high-latency behavior." },
    { label: "DB to Errors", value: intelligence.correlationMatrix.dbToErrors, key: "db_to_errors", boostedKey: "DB_LATENCY<->ERROR_RATE", description: "Relationship between DB delays and runtime failure rate." },
    { label: "AI to Queue", value: intelligence.correlationMatrix.aiToQueue, key: "ai_to_queue", boostedKey: "AI_LATENCY<->QUEUE_SIZE", description: "Relationship between AI delay and queue expansion pressure." },
  ];
}

export function buildSlopeRows(intelligence: IntelligenceExplainPayload): SlopeRow[] {
  const entries = Object.entries(intelligence.slopeValues);
  if (entries.length === 0) {
    return [{ key: "none", label: "No slope values available yet", value: 0 }];
  }

  return entries.map(([key, value]) => ({
    key,
    label: toTitleLabel(key),
    value: Number(value),
  }));
}
