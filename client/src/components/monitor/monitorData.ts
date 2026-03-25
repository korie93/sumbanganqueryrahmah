import type { MetricStatus, MetricTrend } from "@/components/monitor/MetricPanel";
import type { MonitorHistory, MonitorSnapshot, SeriesPoint } from "@/hooks/useSystemMetrics";
import type { ChaosType, IntelligenceExplainPayload } from "@/lib/api";
import {
  getCollectionRollupFreshnessBadgeClass as getSharedCollectionRollupFreshnessBadgeClass,
  getCollectionRollupFreshnessStatus as getSharedCollectionRollupFreshnessStatus,
  type CollectionRollupFreshnessStatus as SharedCollectionRollupFreshnessStatus,
} from "@/lib/collection-rollup-freshness";

export type ChaosOption = {
  type: ChaosType;
  label: string;
  description: string;
  defaultMagnitude: number;
  defaultDurationMs: number;
};

export type MonitorMetricItem = {
  label: string;
  value: number;
  unit: string;
  description: string;
  status: MetricStatus;
  history: number[];
  decimals?: number;
};

export type MonitorMetricGroup = {
  title: string;
  description: string;
  items: MonitorMetricItem[];
};

export type MonitorChartSeries = {
  title: string;
  description: string;
  color: string;
  unit: string;
  data: SeriesPoint[];
};

export type AnomalyRow = {
  label: string;
  key: string;
  value: number;
  description: string;
};

export type CorrelationRow = {
  label: string;
  key: string;
  value: number;
  boostedKey: string;
  description: string;
};

export type SlopeRow = {
  key: string;
  label: string;
  value: number;
};

export type RollupFreshnessStatus = SharedCollectionRollupFreshnessStatus;

export const CHAOS_OPTIONS: ChaosOption[] = [
  {
    type: "cpu_spike",
    label: "CPU Spike",
    description: "Simulate abrupt CPU pressure to validate throttling and overload behavior.",
    defaultMagnitude: 25,
    defaultDurationMs: 20000,
  },
  {
    type: "db_latency_spike",
    label: "DB Latency Spike",
    description: "Inject query slowdown to validate database protection and response impact.",
    defaultMagnitude: 450,
    defaultDurationMs: 20000,
  },
  {
    type: "ai_delay",
    label: "AI Delay",
    description: "Delay AI operations to validate queue handling and fail-rate resilience.",
    defaultMagnitude: 600,
    defaultDurationMs: 20000,
  },
  {
    type: "worker_crash",
    label: "Worker Crash",
    description: "Simulate worker loss to validate system stability under reduced capacity.",
    defaultMagnitude: 1,
    defaultDurationMs: 20000,
  },
  {
    type: "memory_pressure",
    label: "Memory Pressure",
    description: "Increase memory pressure to validate event-loop and runtime degradation handling.",
    defaultMagnitude: 18,
    defaultDurationMs: 20000,
  },
];

export const getTrend = (values: number[]): MetricTrend => {
  if (values.length < 2) return "neutral";
  const previous = values[values.length - 2];
  const current = values[values.length - 1];
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "neutral";
};

export const getStatus = (value: number, warning: number, critical: number, inverse = false): MetricStatus => {
  if (!Number.isFinite(value)) return "warning";
  if (!inverse) {
    if (value >= critical) return "critical";
    if (value >= warning) return "warning";
    return "good";
  }
  if (value <= critical) return "critical";
  if (value <= warning) return "warning";
  return "good";
};

const LEGACY_ARROW_SEQUENCE = "\u00e2\u2020\u201d";
const UNICODE_ARROW_SEQUENCE = "\u2194";

const buildBoostedPattern = (prefix: string) =>
  new RegExp(`${prefix}(?:${LEGACY_ARROW_SEQUENCE}|${UNICODE_ARROW_SEQUENCE})`, "g");

const CPU_BOOSTED_PATTERN = buildBoostedPattern("CPU");
const DB_BOOSTED_PATTERN = buildBoostedPattern("DB_LATENCY");
const AI_BOOSTED_PATTERN = buildBoostedPattern("AI_LATENCY");

export const normalizeBoostedKey = (value: string) =>
  value
    .replace(CPU_BOOSTED_PATTERN, "CPU<->")
    .replace(DB_BOOSTED_PATTERN, "DB_LATENCY<->")
    .replace(AI_BOOSTED_PATTERN, "AI_LATENCY<->");

export const toTitleLabel = (value: string) =>
  value
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());

export const getScoreStatus = (score: number): MetricStatus => {
  if (score >= 85) return "good";
  if (score >= 60) return "warning";
  return "critical";
};

export const getModeBadgeClass = (mode: string) => {
  if (mode === "NORMAL") return "border-emerald-500/30 bg-emerald-500/15 text-emerald-500";
  if (mode === "DEGRADED") return "border-amber-500/30 bg-amber-500/15 text-amber-500";
  return "border-red-500/30 bg-red-500/15 text-red-500";
};

export const getRollupFreshnessStatus = (snapshot: Pick<
  MonitorSnapshot,
  "rollupRefreshPendingCount" | "rollupRefreshRetryCount" | "rollupRefreshOldestPendingAgeMs"
>): RollupFreshnessStatus => {
  return getSharedCollectionRollupFreshnessStatus({
    pendingCount: snapshot.rollupRefreshPendingCount,
    retryCount: snapshot.rollupRefreshRetryCount,
    oldestPendingAgeMs: snapshot.rollupRefreshOldestPendingAgeMs,
  });
};

export const getRollupFreshnessBadgeClass = (status: RollupFreshnessStatus) => {
  return getSharedCollectionRollupFreshnessBadgeClass(status);
};

export const formatMonitorDurationCompact = (durationMs: number) => {
  const safeMs = Math.max(0, Math.round(Number(durationMs || 0)));
  if (safeMs >= 3_600_000) {
    const hours = Math.floor(safeMs / 3_600_000);
    const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (safeMs >= 60_000) {
    const minutes = Math.floor(safeMs / 60_000);
    const seconds = Math.floor((safeMs % 60_000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  if (safeMs >= 1000) {
    return `${(safeMs / 1000).toFixed(safeMs >= 10_000 ? 0 : 1)}s`;
  }
  return `${safeMs}ms`;
};

export const buildRollupFreshnessSummary = (snapshot: Pick<
  MonitorSnapshot,
  | "rollupRefreshPendingCount"
  | "rollupRefreshRunningCount"
  | "rollupRefreshRetryCount"
  | "rollupRefreshOldestPendingAgeMs"
>) => {
  const status = getRollupFreshnessStatus(snapshot);
  if (status === "fresh") {
    return "Fresh: collection report rollups are keeping up with current mutations.";
  }

  const oldestAge = formatMonitorDurationCompact(snapshot.rollupRefreshOldestPendingAgeMs);
  const retryText = snapshot.rollupRefreshRetryCount > 0
    ? ` ${snapshot.rollupRefreshRetryCount} slice(s) waiting to retry.`
    : "";

  if (status === "warming") {
    return `Warming: ${snapshot.rollupRefreshPendingCount} pending slice(s), ${snapshot.rollupRefreshRunningCount} running, oldest ${oldestAge}.${retryText}`;
  }

  return `Stale: ${snapshot.rollupRefreshPendingCount} pending slice(s), oldest ${oldestAge}.${retryText}`;
};

export const getGovernanceClass = (governanceState: string) => {
  if (governanceState === "LOCKDOWN" || governanceState === "FAIL_SAFE") {
    return "border-red-500/35 bg-red-500/15 text-red-500";
  }
  if (governanceState === "COOLDOWN" || governanceState === "CONSENSUS_PENDING") {
    return "border-amber-500/35 bg-amber-500/15 text-amber-500";
  }
  return "border-emerald-500/35 bg-emerald-500/15 text-emerald-500";
};

export function buildMetricGroups(snapshot: MonitorSnapshot, history: MonitorHistory): MonitorMetricGroup[] {
  return [
    {
      title: "Infrastructure",
      description: "Core runtime capacity and node responsiveness.",
      items: [
        {
          label: "CPU",
          value: snapshot.cpuPercent,
          unit: "%",
          description: "Processor utilization across active workers.",
          status: getStatus(snapshot.cpuPercent, 70, 85),
          history: history.cpuPercent.map((point) => point.value),
        },
        {
          label: "RAM",
          value: snapshot.ramPercent,
          unit: "%",
          description: "Estimated memory consumption used by runtime processes.",
          status: getStatus(snapshot.ramPercent, 75, 90),
          history: history.ramPercent.map((point) => point.value),
        },
        {
          label: "Event Loop Lag",
          value: snapshot.eventLoopLagMs,
          unit: "ms",
          description: "Delay between scheduled and actual event-loop execution.",
          status: getStatus(snapshot.eventLoopLagMs, 80, 150),
          history: history.eventLoopLagMs.map((point) => point.value),
        },
        {
          label: "Worker Count",
          value: snapshot.workerCount,
          unit: "",
          description: "Current active worker processes handling requests.",
          status: getStatus(snapshot.workerCount, Math.max(1, snapshot.maxWorkers - 1), snapshot.maxWorkers),
          history: history.workerCount.map((point) => point.value),
          decimals: 0,
        },
      ],
    },
    {
      title: "Application",
      description: "Request throughput, latency behavior, and request pressure.",
      items: [
        {
          label: "Requests / Sec",
          value: snapshot.requestsPerSec,
          unit: "rps",
          description: "Incoming request throughput per second.",
          status: getStatus(snapshot.requestsPerSec, 80, 140),
          history: history.requestsPerSec.map((point) => point.value),
        },
        {
          label: "p95 Latency",
          value: snapshot.p95LatencyMs,
          unit: "ms",
          description: "95th percentile response time for recent traffic.",
          status: getStatus(snapshot.p95LatencyMs, 450, 900),
          history: history.p95LatencyMs.map((point) => point.value),
        },
        {
          label: "Error Rate",
          value: snapshot.errorRate,
          unit: "%",
          description: "Estimated percentage of failed application operations.",
          status: getStatus(snapshot.errorRate, 2, 5),
          history: history.errorRate.map((point) => point.value),
        },
        {
          label: "Active Requests",
          value: snapshot.activeRequests,
          unit: "",
          description: "Number of requests currently being processed.",
          status: getStatus(snapshot.activeRequests, 80, 130),
          history: history.activeRequests.map((point) => point.value),
          decimals: 0,
        },
      ],
    },
    {
      title: "Database",
      description: "Database timing, query pressure, and connection health.",
      items: [
        {
          label: "Avg Query Time",
          value: snapshot.avgQueryTimeMs,
          unit: "ms",
          description: "Average time spent by database operations.",
          status: getStatus(snapshot.avgQueryTimeMs, 300, 900),
          history: history.avgQueryTimeMs.map((point) => point.value),
        },
        {
          label: "Slow Queries",
          value: snapshot.slowQueryCount,
          unit: "",
          description: "Count of queries exceeding slow-query threshold.",
          status: getStatus(snapshot.slowQueryCount, 1, 3),
          history: history.slowQueryCount.map((point) => point.value),
          decimals: 0,
        },
        {
          label: "Connections",
          value: snapshot.connections,
          unit: "",
          description: "Current database connections in use and waiting.",
          status: getStatus(snapshot.connections, 12, 20),
          history: history.connections.map((point) => point.value),
          decimals: 0,
        },
        {
          label: "Rollup Queue",
          value: snapshot.rollupRefreshPendingCount,
          unit: "",
          description: "Pending collection summary slices waiting for background refresh.",
          status: getStatus(snapshot.rollupRefreshPendingCount, 5, 15),
          history: history.rollupRefreshPendingCount.map((point) => point.value),
          decimals: 0,
        },
        {
          label: "Rollup Retry",
          value: snapshot.rollupRefreshRetryCount,
          unit: "",
          description: "Pending rollup slices that previously failed and are scheduled to retry.",
          status: getStatus(snapshot.rollupRefreshRetryCount, 1, 3),
          history: history.rollupRefreshRetryCount.map((point) => point.value),
          decimals: 0,
        },
        {
          label: "Rollup Refresh Lag",
          value: snapshot.rollupRefreshOldestPendingAgeMs,
          unit: "ms",
          description: "Age of the oldest pending rollup slice in the background refresh queue.",
          status: getStatus(snapshot.rollupRefreshOldestPendingAgeMs, 30_000, 120_000),
          history: history.rollupRefreshOldestPendingAgeMs.map((point) => point.value),
          decimals: 0,
        },
      ],
    },
    {
      title: "Security & Resilience",
      description: "Authentication pressure, rate-limit spikes, and circuit-breaker activity.",
      items: [
        {
          label: "401 Spike (5s)",
          value: snapshot.status401Count,
          unit: "",
          description: "Unauthorized responses observed in the latest 5-second window.",
          status: getStatus(snapshot.status401Count, 10, 25),
          history: history.status401Count.map((point) => point.value),
          decimals: 0,
        },
        {
          label: "403 Spike (5s)",
          value: snapshot.status403Count,
          unit: "",
          description: "Forbidden responses observed in the latest 5-second window.",
          status: getStatus(snapshot.status403Count, 10, 25),
          history: history.status403Count.map((point) => point.value),
          decimals: 0,
        },
        {
          label: "429 Spike (5s)",
          value: snapshot.status429Count,
          unit: "",
          description: "Rate-limited responses observed in the latest 5-second window.",
          status: getStatus(snapshot.status429Count, 12, 30),
          history: history.status429Count.map((point) => point.value),
          decimals: 0,
        },
        {
          label: "Open Circuits",
          value: snapshot.openCircuitCount,
          unit: "",
          description: "Total open circuit breakers across local + cluster runtime signals.",
          status: getStatus(snapshot.openCircuitCount, 1, 2),
          history: history.openCircuitCount.map((point) => point.value),
          decimals: 0,
        },
      ],
    },
    {
      title: "AI",
      description: "AI service response performance and queue stability.",
      items: [
        {
          label: "AI Latency",
          value: snapshot.aiLatencyMs,
          unit: "ms",
          description: "Average AI processing response duration.",
          status: getStatus(snapshot.aiLatencyMs, 600, 1200),
          history: history.aiLatencyMs.map((point) => point.value),
        },
        {
          label: "Queue Size",
          value: snapshot.queueSize,
          unit: "",
          description: "Pending AI-related tasks waiting for execution.",
          status: getStatus(snapshot.queueSize, 4, 8),
          history: history.queueSize.map((point) => point.value),
          decimals: 0,
        },
        {
          label: "Fail Rate",
          value: snapshot.aiFailRate,
          unit: "%",
          description: "Percentage of AI operations ending in failure.",
          status: getStatus(snapshot.aiFailRate, 2, 5),
          history: history.aiFailRate.map((point) => point.value),
        },
      ],
    },
  ];
}

export function buildChartSeries(history: MonitorHistory): MonitorChartSeries[] {
  return [
    {
      title: "CPU %",
      description: "Rolling CPU utilization trend for runtime workers.",
      color: "#f59e0b",
      unit: "%",
      data: history.cpuPercent,
    },
    {
      title: "RAM %",
      description: "Rolling memory consumption percentage trend.",
      color: "#3b82f6",
      unit: "%",
      data: history.ramPercent,
    },
    {
      title: "p95 Latency",
      description: "Rolling 95th percentile latency trend.",
      color: "#64748b",
      unit: "ms",
      data: history.p95LatencyMs,
    },
    {
      title: "Error Rate",
      description: "Rolling failure-rate trend across system operations.",
      color: "#ef4444",
      unit: "%",
      data: history.errorRate,
    },
    {
      title: "DB Latency",
      description: "Rolling database latency trend.",
      color: "#8b5cf6",
      unit: "ms",
      data: history.avgQueryTimeMs,
    },
    {
      title: "AI Latency",
      description: "Rolling AI service latency trend.",
      color: "#14b8a6",
      unit: "ms",
      data: history.aiLatencyMs,
    },
  ];
}

export function buildForecastSeries(forecastProjection: number[], lastUpdated: number | null): SeriesPoint[] {
  return forecastProjection.map((value, index) => ({
    ts: (lastUpdated || 0) + (index * 5000),
    value,
  }));
}

export function buildAnomalyRows(intelligence: IntelligenceExplainPayload): AnomalyRow[] {
  return [
    {
      label: "Normalized Z-Score",
      key: "normalizedZScore",
      value: intelligence.anomalyBreakdown.normalizedZScore,
      description: "Distance from baseline behavior after normalization.",
    },
    {
      label: "Slope Weight",
      key: "slopeWeight",
      value: intelligence.anomalyBreakdown.slopeWeight,
      description: "Trend acceleration impact from linear slope analysis.",
    },
    {
      label: "Percentile Shift",
      key: "percentileShift",
      value: intelligence.anomalyBreakdown.percentileShift,
      description: "Shift against historical percentile position.",
    },
    {
      label: "Correlation Weight",
      key: "correlationWeight",
      value: intelligence.anomalyBreakdown.correlationWeight,
      description: "Boost from cross-metric correlation detection.",
    },
    {
      label: "Forecast Risk",
      key: "forecastRisk",
      value: intelligence.anomalyBreakdown.forecastRisk,
      description: "Predicted near-term instability contribution.",
    },
    {
      label: "Mutation Factor",
      key: "mutationFactor",
      value: intelligence.anomalyBreakdown.mutationFactor,
      description: "Adaptive reduction factor from repeated stability signatures.",
    },
    {
      label: "Weighted Score",
      key: "weightedScore",
      value: intelligence.anomalyBreakdown.weightedScore,
      description: "Final weighted anomaly score used in decision flow.",
    },
  ];
}

export function buildCorrelationRows(intelligence: IntelligenceExplainPayload): CorrelationRow[] {
  return [
    {
      label: "CPU to Latency",
      value: intelligence.correlationMatrix.cpuToLatency,
      key: "cpu_to_latency",
      boostedKey: "CPU<->P95_LATENCY",
      description: "Relationship between CPU load and high-latency behavior.",
    },
    {
      label: "DB to Errors",
      value: intelligence.correlationMatrix.dbToErrors,
      key: "db_to_errors",
      boostedKey: "DB_LATENCY<->ERROR_RATE",
      description: "Relationship between DB delays and runtime failure rate.",
    },
    {
      label: "AI to Queue",
      value: intelligence.correlationMatrix.aiToQueue,
      key: "ai_to_queue",
      boostedKey: "AI_LATENCY<->QUEUE_SIZE",
      description: "Relationship between AI delay and queue expansion pressure.",
    },
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
