import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorInsightsCompactSummary,
  buildMonitorInsightsDecisionSummaryBadges,
  buildMonitorInsightsExplainabilityBadges,
  buildMonitorInsightsForecastBadges,
  buildMonitorInsightsSummaryFacts,
  resolveInitialMonitorInsightsOpenState,
} from "@/components/monitor/monitor-insights-utils";
import type { IntelligenceExplainPayload } from "@/lib/api";

const intelligence: IntelligenceExplainPayload = {
  anomalyBreakdown: {
    normalizedZScore: 0.71,
    slopeWeight: 0.22,
    percentileShift: 0.35,
    correlationWeight: 0.4,
    forecastRisk: 0.51,
    mutationFactor: 0.11,
    weightedScore: 0.48,
  },
  correlationMatrix: {
    cpuToLatency: 0.91,
    dbToErrors: 0.43,
    aiToQueue: 0.66,
    boostedPairs: ["cpuToLatency", "aiToQueue"],
  },
  slopeValues: {
    cpu: 0.11,
    latency: 0.29,
    errors: 0.08,
  },
  forecastProjection: [120, 132, 140, 128],
  governanceState: "CONSENSUS_PENDING",
  chosenStrategy: {
    strategy: "ADAPTIVE",
    recommendedAction: "ENABLE_THROTTLE_MODE",
    confidenceScore: 0.874,
    reason: "Adaptive path chosen.",
  },
  decisionReason: "Queue pressure and latency trend exceeded preferred guardrails.",
};

test("resolveInitialMonitorInsightsOpenState keeps mobile compact by default", () => {
  assert.deepEqual(resolveInitialMonitorInsightsOpenState(390), {
    summaryOpen: false,
    explainabilityOpen: false,
    forecastOpen: false,
  });
});

test("resolveInitialMonitorInsightsOpenState keeps desktop summary open", () => {
  assert.deepEqual(resolveInitialMonitorInsightsOpenState(1280), {
    summaryOpen: true,
    explainabilityOpen: false,
    forecastOpen: false,
  });
});

test("buildMonitorInsightsDecisionSummaryBadges exposes core decision signals", () => {
  assert.deepEqual(buildMonitorInsightsDecisionSummaryBadges(intelligence), [
    { label: "State", value: "CONSENSUS_PENDING" },
    { label: "Strategy", value: "ADAPTIVE" },
    { label: "Action", value: "Throttle" },
    { label: "Confidence", value: "87.4%" },
  ]);
});

test("buildMonitorInsightsExplainabilityBadges summarizes reasoning inputs", () => {
  assert.deepEqual(buildMonitorInsightsExplainabilityBadges(intelligence), [
    { label: "Signals", value: "7" },
    { label: "Boosted", value: "2" },
    { label: "Slopes", value: "3" },
  ]);
});

test("buildMonitorInsightsForecastBadges summarizes projection size and range", () => {
  assert.deepEqual(buildMonitorInsightsForecastBadges(intelligence), [
    { label: "Points", value: "4" },
    { label: "Peak", value: "140ms" },
    { label: "Latest", value: "128ms" },
  ]);
});

test("buildMonitorInsightsCompactSummary keeps active decisioning copy predictable", () => {
  assert.deepEqual(buildMonitorInsightsCompactSummary(intelligence), {
    tone: "watch",
    badge: "Watch",
    headline: "Decisioning is active, with deeper explainability available on demand.",
    description: "Consensus governance is paired with throttle guidance at 87.4% confidence.",
  });
});

test("buildMonitorInsightsSummaryFacts exposes state, action, correlation, and confidence", () => {
  assert.deepEqual(buildMonitorInsightsSummaryFacts(intelligence), [
    { label: "State", value: "Consensus", tone: "watch" },
    { label: "Action", value: "Throttle", tone: "watch" },
    { label: "Boosted", value: "2", tone: "watch" },
    { label: "Confidence", value: "87.4%", tone: "stable" },
  ]);
});
