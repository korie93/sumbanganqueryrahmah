import type {
  EndpointState,
  MonitorHistory,
  MonitorSnapshot,
} from "@/hooks/system-metrics-types";
import type {
  IntelligenceExplainPayload,
  MonitorAlert,
  MonitorAlertIncident,
  MonitorPagination,
} from "@/lib/api";
import type { WebVitalOverviewPayload } from "@shared/web-vitals";

export const toFixedNumber = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const deriveRamPercent = (workers: Array<{ heapUsedMB: number }>) => {
  if (workers.length === 0) return 0;
  const usedMb = workers.reduce((sum, worker) => sum + Number(worker.heapUsedMB || 0), 0);
  const estimatedTotalMb = workers.length * 512;
  if (estimatedTotalMb <= 0) return 0;
  return clamp((usedMb / estimatedTotalMb) * 100, 0, 100);
};

export const deriveP95Latency = (workers: Array<{ latencyP95Ms: number }>) => {
  if (workers.length === 0) return 0;
  return workers.reduce((max, worker) => Math.max(max, Number(worker.latencyP95Ms || 0)), 0);
};

export const deriveSlowQueries = (workers: Array<{ dbLatencyMs: number }>) =>
  workers.filter((worker) => Number(worker.dbLatencyMs || 0) > 600).length;

export const deriveBottleneck = (snapshot: MonitorSnapshot): string => {
  const pairs: Array<{ key: string; score: number }> = [
    { key: "CPU", score: snapshot.cpuPercent / 100 },
    { key: "RAM", score: snapshot.ramPercent / 100 },
    { key: "DB", score: snapshot.avgQueryTimeMs / 1200 },
    { key: "AI", score: snapshot.aiLatencyMs / 1500 },
    { key: "EVENT_LOOP", score: snapshot.eventLoopLagMs / 160 },
    { key: "ERRORS", score: snapshot.errorRate / 10 },
  ];
  const top = pairs.reduce((best, current) => (current.score > best.score ? current : best), pairs[0]);
  return top.score >= 0.5 ? top.key : "NONE";
};

export const snapshotsEqual = (a: MonitorSnapshot, b: MonitorSnapshot) => (
  a.mode === b.mode &&
  a.score === b.score &&
  a.bottleneckType === b.bottleneckType &&
  a.workerCount === b.workerCount &&
  a.maxWorkers === b.maxWorkers &&
  a.activeAlertCount === b.activeAlertCount &&
  a.cpuPercent === b.cpuPercent &&
  a.ramPercent === b.ramPercent &&
  a.eventLoopLagMs === b.eventLoopLagMs &&
  a.requestsPerSec === b.requestsPerSec &&
  a.p95LatencyMs === b.p95LatencyMs &&
  a.errorRate === b.errorRate &&
  a.activeRequests === b.activeRequests &&
  a.avgQueryTimeMs === b.avgQueryTimeMs &&
  a.slowQueryCount === b.slowQueryCount &&
  a.connections === b.connections &&
  a.aiLatencyMs === b.aiLatencyMs &&
  a.queueSize === b.queueSize &&
  a.rollupRefreshPendingCount === b.rollupRefreshPendingCount &&
  a.rollupRefreshRunningCount === b.rollupRefreshRunningCount &&
  a.rollupRefreshRetryCount === b.rollupRefreshRetryCount &&
  a.rollupRefreshOldestPendingAgeMs === b.rollupRefreshOldestPendingAgeMs &&
  a.aiFailRate === b.aiFailRate &&
  a.status401Count === b.status401Count &&
  a.status403Count === b.status403Count &&
  a.status429Count === b.status429Count &&
  a.openCircuitCount === b.openCircuitCount
);

export const endpointStatesEqual = (a: EndpointState, b: EndpointState) =>
  a.health === b.health &&
  a.mode === b.mode &&
  a.workers === b.workers &&
  a.alerts === b.alerts &&
  a.alertHistory === b.alertHistory &&
  a.webVitals === b.webVitals &&
  a.explain === b.explain;

export const alertsEqual = (a: MonitorAlert[], b: MonitorAlert[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].id !== b[i].id ||
      a[i].severity !== b[i].severity ||
      a[i].message !== b[i].message ||
      a[i].timestamp !== b[i].timestamp
    ) {
      return false;
    }
  }
  return true;
};

export const alertHistoryEqual = (a: MonitorAlertIncident[], b: MonitorAlertIncident[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].id !== b[i].id ||
      a[i].severity !== b[i].severity ||
      a[i].status !== b[i].status ||
      a[i].message !== b[i].message ||
      a[i].updatedAt !== b[i].updatedAt
    ) {
      return false;
    }
  }
  return true;
};

export const monitorPaginationEqual = (a: MonitorPagination, b: MonitorPagination) => (
  a.page === b.page &&
  a.pageSize === b.pageSize &&
  a.totalItems === b.totalItems &&
  a.totalPages === b.totalPages
);

const numberArraysEqual = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const stringArraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const numberRecordsEqual = (a: Record<string, number>, b: Record<string, number>) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!(key in b)) return false;
    if (a[key] !== b[key]) return false;
  }
  return true;
};

export const explainabilityEqual = (a: IntelligenceExplainPayload, b: IntelligenceExplainPayload) => (
  a.anomalyBreakdown.normalizedZScore === b.anomalyBreakdown.normalizedZScore &&
  a.anomalyBreakdown.slopeWeight === b.anomalyBreakdown.slopeWeight &&
  a.anomalyBreakdown.percentileShift === b.anomalyBreakdown.percentileShift &&
  a.anomalyBreakdown.correlationWeight === b.anomalyBreakdown.correlationWeight &&
  a.anomalyBreakdown.forecastRisk === b.anomalyBreakdown.forecastRisk &&
  a.anomalyBreakdown.mutationFactor === b.anomalyBreakdown.mutationFactor &&
  a.anomalyBreakdown.weightedScore === b.anomalyBreakdown.weightedScore &&
  a.correlationMatrix.cpuToLatency === b.correlationMatrix.cpuToLatency &&
  a.correlationMatrix.dbToErrors === b.correlationMatrix.dbToErrors &&
  a.correlationMatrix.aiToQueue === b.correlationMatrix.aiToQueue &&
  stringArraysEqual(a.correlationMatrix.boostedPairs, b.correlationMatrix.boostedPairs) &&
  numberRecordsEqual(a.slopeValues, b.slopeValues) &&
  numberArraysEqual(a.forecastProjection, b.forecastProjection) &&
  a.governanceState === b.governanceState &&
  a.chosenStrategy.strategy === b.chosenStrategy.strategy &&
  a.chosenStrategy.recommendedAction === b.chosenStrategy.recommendedAction &&
  a.chosenStrategy.confidenceScore === b.chosenStrategy.confidenceScore &&
  a.chosenStrategy.reason === b.chosenStrategy.reason &&
  a.decisionReason === b.decisionReason
);

export const webVitalsOverviewEqual = (a: WebVitalOverviewPayload, b: WebVitalOverviewPayload) => {
  if (
    a.windowMinutes !== b.windowMinutes ||
    a.totalSamples !== b.totalSamples ||
    a.updatedAt !== b.updatedAt ||
    a.pageSummaries.length !== b.pageSummaries.length
  ) {
    return false;
  }

  for (let pageIndex = 0; pageIndex < a.pageSummaries.length; pageIndex += 1) {
    const leftPage = a.pageSummaries[pageIndex];
    const rightPage = b.pageSummaries[pageIndex];
    if (
      leftPage.pageType !== rightPage.pageType ||
      leftPage.sampleCount !== rightPage.sampleCount ||
      leftPage.latestCapturedAt !== rightPage.latestCapturedAt ||
      leftPage.metrics.length !== rightPage.metrics.length
    ) {
      return false;
    }

    for (let metricIndex = 0; metricIndex < leftPage.metrics.length; metricIndex += 1) {
      const leftMetric = leftPage.metrics[metricIndex];
      const rightMetric = rightPage.metrics[metricIndex];
      if (
        leftMetric.name !== rightMetric.name ||
        leftMetric.sampleCount !== rightMetric.sampleCount ||
        leftMetric.p75 !== rightMetric.p75 ||
        leftMetric.p75Rating !== rightMetric.p75Rating ||
        leftMetric.latestValue !== rightMetric.latestValue ||
        leftMetric.latestRating !== rightMetric.latestRating ||
        leftMetric.latestCapturedAt !== rightMetric.latestCapturedAt ||
        leftMetric.latestPath !== rightMetric.latestPath
      ) {
        return false;
      }
    }
  }

  return true;
};

export const getSnapshotValueByHistoryKey = (snapshot: MonitorSnapshot, key: keyof MonitorHistory) => snapshot[key];
