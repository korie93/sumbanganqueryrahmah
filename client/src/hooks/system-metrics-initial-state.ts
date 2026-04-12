import type {
  IntelligenceExplainPayload,
  MonitorPagination,
} from "@/lib/api";
import type { WebVitalOverviewPayload } from "@shared/web-vitals";
import { WEB_VITAL_NAMES, WEB_VITAL_PAGE_TYPES } from "@shared/web-vitals";
import type {
  HistoryKey,
  MonitorHistory,
  MonitorSnapshot,
} from "@/hooks/system-metrics-types";

export const initialSnapshot: MonitorSnapshot = {
  mode: "NORMAL",
  score: 0,
  bottleneckType: "NONE",
  workerCount: 0,
  maxWorkers: 0,
  activeAlertCount: 0,
  cpuPercent: 0,
  ramPercent: 0,
  eventLoopLagMs: 0,
  requestsPerSec: 0,
  p95LatencyMs: 0,
  errorRate: 0,
  activeRequests: 0,
  avgQueryTimeMs: 0,
  slowQueryCount: 0,
  connections: 0,
  aiLatencyMs: 0,
  queueSize: 0,
  rollupRefreshPendingCount: 0,
  rollupRefreshRunningCount: 0,
  rollupRefreshRetryCount: 0,
  rollupRefreshOldestPendingAgeMs: 0,
  aiFailRate: 0,
  status401Count: 0,
  status403Count: 0,
  status429Count: 0,
  openCircuitCount: 0,
};

export const initialHistory: MonitorHistory = {
  cpuPercent: [],
  ramPercent: [],
  eventLoopLagMs: [],
  workerCount: [],
  requestsPerSec: [],
  p95LatencyMs: [],
  errorRate: [],
  activeRequests: [],
  avgQueryTimeMs: [],
  slowQueryCount: [],
  connections: [],
  aiLatencyMs: [],
  queueSize: [],
  rollupRefreshPendingCount: [],
  rollupRefreshRetryCount: [],
  rollupRefreshOldestPendingAgeMs: [],
  aiFailRate: [],
  status401Count: [],
  status403Count: [],
  status429Count: [],
  openCircuitCount: [],
};

export const HISTORY_KEYS: HistoryKey[] = [
  "cpuPercent",
  "ramPercent",
  "eventLoopLagMs",
  "workerCount",
  "requestsPerSec",
  "p95LatencyMs",
  "errorRate",
  "activeRequests",
  "avgQueryTimeMs",
  "slowQueryCount",
  "connections",
  "aiLatencyMs",
  "queueSize",
  "rollupRefreshPendingCount",
  "rollupRefreshRetryCount",
  "rollupRefreshOldestPendingAgeMs",
  "aiFailRate",
  "status401Count",
  "status403Count",
  "status429Count",
  "openCircuitCount",
];

export const initialIntelligence: IntelligenceExplainPayload = {
  anomalyBreakdown: {
    normalizedZScore: 0,
    slopeWeight: 0,
    percentileShift: 0,
    correlationWeight: 0,
    forecastRisk: 0,
    mutationFactor: 1,
    weightedScore: 0,
  },
  correlationMatrix: {
    cpuToLatency: 0,
    dbToErrors: 0,
    aiToQueue: 0,
    boostedPairs: [],
  },
  slopeValues: {},
  forecastProjection: [],
  governanceState: "IDLE",
  chosenStrategy: {
    strategy: "CONSERVATIVE",
    recommendedAction: "NONE",
    confidenceScore: 0.5,
    reason: "No evaluation yet.",
  },
  decisionReason: "No evaluation yet.",
};

export const initialWebVitalsOverview: WebVitalOverviewPayload = {
  windowMinutes: 15,
  totalSamples: 0,
  pageSummaries: WEB_VITAL_PAGE_TYPES.map((pageType) => ({
    pageType,
    sampleCount: 0,
    latestCapturedAt: null,
    metrics: WEB_VITAL_NAMES.map((name) => ({
      name,
      sampleCount: 0,
      p75: null,
      p75Rating: null,
      latestValue: null,
      latestRating: null,
      latestCapturedAt: null,
      latestPath: null,
    })),
  })),
  updatedAt: new Date(0).toISOString(),
};

export const initialMonitorPagination: MonitorPagination = {
  page: 1,
  pageSize: 5,
  totalItems: 0,
  totalPages: 1,
};
