import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type IntelligenceExplainPayload,
  type MonitorAlert,
  type MonitorRequestState,
  getAlerts,
  getIntelligenceExplain,
  getSystemHealth,
  getSystemMode,
  getWorkers,
} from "@/lib/api";

export type HistoryKey =
  | "cpuPercent"
  | "ramPercent"
  | "eventLoopLagMs"
  | "workerCount"
  | "requestsPerSec"
  | "p95LatencyMs"
  | "errorRate"
  | "activeRequests"
  | "avgQueryTimeMs"
  | "slowQueryCount"
  | "connections"
  | "aiLatencyMs"
  | "queueSize"
  | "aiFailRate";

export type SeriesPoint = {
  ts: number;
  value: number;
};

export type MonitorHistory = Record<HistoryKey, SeriesPoint[]>;

type EndpointState = {
  health: MonitorRequestState;
  mode: MonitorRequestState;
  workers: MonitorRequestState;
  alerts: MonitorRequestState;
  explain: MonitorRequestState;
};

export type MonitorSnapshot = {
  mode: string;
  score: number;
  bottleneckType: string;
  workerCount: number;
  maxWorkers: number;
  activeAlertCount: number;
  cpuPercent: number;
  ramPercent: number;
  eventLoopLagMs: number;
  requestsPerSec: number;
  p95LatencyMs: number;
  errorRate: number;
  activeRequests: number;
  avgQueryTimeMs: number;
  slowQueryCount: number;
  connections: number;
  aiLatencyMs: number;
  queueSize: number;
  aiFailRate: number;
};

type UseSystemMetricsResult = {
  isLoading: boolean;
  lastUpdated: number | null;
  snapshot: MonitorSnapshot;
  history: MonitorHistory;
  alerts: MonitorAlert[];
  intelligence: IntelligenceExplainPayload;
  endpointState: EndpointState;
  accessDenied: boolean;
  hasNetworkFailure: boolean;
};

const POLL_INTERVAL_MS = 5000;
const ROLLING_LIMIT = 60;

const initialSnapshot: MonitorSnapshot = {
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
  aiFailRate: 0,
};

const initialHistory: MonitorHistory = {
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
  aiFailRate: [],
};

const HISTORY_KEYS: HistoryKey[] = [
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
  "aiFailRate",
];

const initialIntelligence: IntelligenceExplainPayload = {
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

const toFixedNumber = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const deriveRamPercent = (workers: Array<{ heapUsedMB: number }>) => {
  if (workers.length === 0) return 0;
  const usedMb = workers.reduce((sum, worker) => sum + Number(worker.heapUsedMB || 0), 0);
  const estimatedTotalMb = workers.length * 512;
  if (estimatedTotalMb <= 0) return 0;
  return clamp((usedMb / estimatedTotalMb) * 100, 0, 100);
};

const deriveP95Latency = (workers: Array<{ latencyP95Ms: number }>) => {
  if (workers.length === 0) return 0;
  return workers.reduce((max, worker) => Math.max(max, Number(worker.latencyP95Ms || 0)), 0);
};

const deriveSlowQueries = (workers: Array<{ dbLatencyMs: number }>) =>
  workers.filter((worker) => Number(worker.dbLatencyMs || 0) > 600).length;

const deriveBottleneck = (snapshot: MonitorSnapshot): string => {
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

const snapshotsEqual = (a: MonitorSnapshot, b: MonitorSnapshot) => (
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
  a.aiFailRate === b.aiFailRate
);

const endpointStatesEqual = (a: EndpointState, b: EndpointState) =>
  a.health === b.health &&
  a.mode === b.mode &&
  a.workers === b.workers &&
  a.alerts === b.alerts &&
  a.explain === b.explain;

const alertsEqual = (a: MonitorAlert[], b: MonitorAlert[]) => {
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

const explainabilityEqual = (a: IntelligenceExplainPayload, b: IntelligenceExplainPayload) => (
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

const getSnapshotValueByHistoryKey = (snapshot: MonitorSnapshot, key: HistoryKey) => snapshot[key];

const appendHistorySnapshot = (
  previousHistory: MonitorHistory,
  snapshot: MonitorSnapshot,
  ts: number,
) => {
  let nextHistory = previousHistory;

  for (const key of HISTORY_KEYS) {
    const value = getSnapshotValueByHistoryKey(snapshot, key);
    const currentSeries = previousHistory[key];
    const lastPoint = currentSeries[currentSeries.length - 1];

    if (lastPoint && lastPoint.value === value) {
      continue;
    }

    const nextSeries = currentSeries.length >= ROLLING_LIMIT
      ? [...currentSeries.slice(currentSeries.length - ROLLING_LIMIT + 1), { ts, value }]
      : [...currentSeries, { ts, value }];

    if (nextHistory === previousHistory) {
      nextHistory = { ...previousHistory };
    }

    nextHistory[key] = nextSeries;
  }

  return nextHistory;
};

export function useSystemMetrics(): UseSystemMetricsResult {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(initialSnapshot);
  const [history, setHistory] = useState<MonitorHistory>(initialHistory);
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [intelligence, setIntelligence] = useState<IntelligenceExplainPayload>(initialIntelligence);
  const [endpointState, setEndpointState] = useState<EndpointState>({
    health: "ok",
    mode: "ok",
    workers: "ok",
    alerts: "ok",
    explain: "ok",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const historyRef = useRef(history);
  const snapshotRef = useRef(snapshot);
  const alertsRef = useRef(alerts);
  const intelligenceRef = useRef(intelligence);
  const endpointStateRef = useRef(endpointState);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    intelligenceRef.current = intelligence;
  }, [intelligence]);

  useEffect(() => {
    endpointStateRef.current = endpointState;
  }, [endpointState]);

  const pollMetrics = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const [healthRes, modeRes, workersRes, alertsRes, explainRes] = await Promise.all([
        getSystemHealth(),
        getSystemMode(),
        getWorkers(),
        getAlerts(),
        getIntelligenceExplain(),
      ]);

      const previous = snapshotRef.current;
      const workers = workersRes.data?.workers ?? [];
      const mode = modeRes.data?.mode ?? healthRes.data?.mode ?? previous.mode;
      const score = toFixedNumber(Number(healthRes.data?.score ?? previous.score), 2);
      const cpuPercent = toFixedNumber(Number(healthRes.data?.cpuPercent ?? previous.cpuPercent), 2);
      const ramPercent = toFixedNumber(
        Number(healthRes.data?.ramPercent ?? deriveRamPercent(workers) ?? previous.ramPercent),
        2,
      );
      const eventLoopLagMs = toFixedNumber(Number(healthRes.data?.eventLoopLagMs ?? previous.eventLoopLagMs), 2);
      const requestsPerSec = toFixedNumber(Number(healthRes.data?.requestRate ?? previous.requestsPerSec), 2);
      const p95LatencyMs = toFixedNumber(
        Number(healthRes.data?.p95LatencyMs ?? deriveP95Latency(workers) ?? previous.p95LatencyMs),
        2,
      );
      const aiFailRate = toFixedNumber(Number(healthRes.data?.aiFailRate ?? previous.aiFailRate), 2);
      const errorRate = toFixedNumber(Number(healthRes.data?.errorRate ?? aiFailRate ?? previous.errorRate), 2);
      const activeRequests = toFixedNumber(Number(healthRes.data?.activeRequests ?? previous.activeRequests), 2);
      const avgQueryTimeMs = toFixedNumber(Number(healthRes.data?.dbLatencyMs ?? previous.avgQueryTimeMs), 2);
      const slowQueryCount = toFixedNumber(
        Number(healthRes.data?.slowQueryCount ?? deriveSlowQueries(workers) ?? previous.slowQueryCount),
        2,
      );
      const connections = toFixedNumber(
        Number(healthRes.data?.dbConnections ?? workersRes.data?.count ?? previous.connections),
        2,
      );
      const aiLatencyMs = toFixedNumber(Number(healthRes.data?.aiLatencyMs ?? previous.aiLatencyMs), 2);
      const queueSize = toFixedNumber(Number(healthRes.data?.queueLength ?? previous.queueSize), 2);
      const workerCount = Number(workersRes.data?.count ?? healthRes.data?.workerCount ?? previous.workerCount);
      const maxWorkers = Number(workersRes.data?.maxWorkers ?? healthRes.data?.maxWorkers ?? previous.maxWorkers);
      const nextAlerts = alertsRes.data?.alerts ?? alertsRef.current;
      const activeAlertCount = Number(healthRes.data?.activeAlertCount ?? nextAlerts.length);

      const provisionalSnapshot: MonitorSnapshot = {
        mode,
        score,
        bottleneckType: String(healthRes.data?.bottleneckType || ""),
        workerCount,
        maxWorkers,
        activeAlertCount,
        cpuPercent,
        ramPercent,
        eventLoopLagMs,
        requestsPerSec,
        p95LatencyMs,
        errorRate,
        activeRequests,
        avgQueryTimeMs,
        slowQueryCount,
        connections,
        aiLatencyMs,
        queueSize,
        aiFailRate,
      };

      const nextSnapshot: MonitorSnapshot = {
        ...provisionalSnapshot,
        bottleneckType: provisionalSnapshot.bottleneckType || deriveBottleneck(provisionalSnapshot),
      };

      const now = Date.now();
      const nextHistory = appendHistorySnapshot(historyRef.current, nextSnapshot, now);
      const historyChanged = nextHistory !== historyRef.current;

      if (historyChanged) {
        historyRef.current = nextHistory;
        if (mountedRef.current) {
          setHistory(nextHistory);
        }
      }

      const snapshotChanged = !snapshotsEqual(snapshotRef.current, nextSnapshot);
      const alertsChanged = !alertsEqual(alertsRef.current, nextAlerts);
      const nextIntelligence = explainRes.data ?? intelligenceRef.current;
      const intelligenceChanged = !explainabilityEqual(intelligenceRef.current, nextIntelligence);
      if (snapshotChanged) {
        if (mountedRef.current) {
          setSnapshot(nextSnapshot);
        }
      }
      if (alertsChanged) {
        if (mountedRef.current) {
          setAlerts(nextAlerts);
        }
      }
      if (intelligenceChanged) {
        if (mountedRef.current) {
          setIntelligence(nextIntelligence);
        }
      }

      const nextEndpointState: EndpointState = {
        health: healthRes.state,
        mode: modeRes.state,
        workers: workersRes.state,
        alerts: alertsRes.state,
        explain: explainRes.state,
      };
      const endpointChanged = !endpointStatesEqual(endpointStateRef.current, nextEndpointState);
      if (endpointChanged) {
        if (mountedRef.current) {
          setEndpointState(nextEndpointState);
        }
      }

      if (mountedRef.current && (snapshotChanged || alertsChanged || intelligenceChanged || endpointChanged || historyChanged)) {
        const responseTs = Number(
          healthRes.data?.updatedAt ??
            modeRes.data?.updatedAt ??
            workersRes.data?.updatedAt ??
            alertsRes.data?.updatedAt ??
            now,
        );
        setLastUpdated((prev) => (prev === responseTs ? prev : responseTs));
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    pollMetrics();
    const timer = window.setInterval(pollMetrics, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [pollMetrics]);

  const accessDenied = useMemo(
    () =>
      endpointState.health === "forbidden" ||
      endpointState.mode === "forbidden" ||
      endpointState.workers === "forbidden" ||
      endpointState.alerts === "forbidden" ||
      endpointState.explain === "forbidden" ||
      endpointState.health === "unauthorized" ||
      endpointState.mode === "unauthorized" ||
      endpointState.workers === "unauthorized" ||
      endpointState.alerts === "unauthorized" ||
      endpointState.explain === "unauthorized",
    [endpointState],
  );

  const hasNetworkFailure = useMemo(
    () =>
      endpointState.health === "network_error" ||
      endpointState.mode === "network_error" ||
      endpointState.workers === "network_error" ||
      endpointState.alerts === "network_error" ||
      endpointState.explain === "network_error",
    [endpointState],
  );

  return {
    isLoading,
    lastUpdated,
    snapshot,
    history,
    alerts,
    intelligence,
    endpointState,
    accessDenied,
    hasNetworkFailure,
  };
}
