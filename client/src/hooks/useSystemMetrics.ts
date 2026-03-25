import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type IntelligenceExplainPayload,
  type MonitorAlert,
  type MonitorAlertIncident,
  type MonitorRequestState,
  getAlertHistory,
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
  | "rollupRefreshPendingCount"
  | "rollupRefreshRetryCount"
  | "rollupRefreshOldestPendingAgeMs"
  | "aiFailRate"
  | "status401Count"
  | "status403Count"
  | "status429Count"
  | "openCircuitCount";

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
  alertHistory: MonitorRequestState;
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
  rollupRefreshPendingCount: number;
  rollupRefreshRunningCount: number;
  rollupRefreshRetryCount: number;
  rollupRefreshOldestPendingAgeMs: number;
  aiFailRate: number;
  status401Count: number;
  status403Count: number;
  status429Count: number;
  openCircuitCount: number;
};

type UseSystemMetricsResult = {
  isLoading: boolean;
  lastUpdated: number | null;
  snapshot: MonitorSnapshot;
  history: MonitorHistory;
  alerts: MonitorAlert[];
  alertHistory: MonitorAlertIncident[];
  intelligence: IntelligenceExplainPayload;
  endpointState: EndpointState;
  accessDenied: boolean;
  hasNetworkFailure: boolean;
  refreshNow: () => Promise<void>;
};

const POLL_INTERVAL_MS = 5000;
const LOW_SPEC_POLL_INTERVAL_MS = 10000;
const HIDDEN_POLL_INTERVAL_MS = 15000;
const LOW_SPEC_HIDDEN_POLL_INTERVAL_MS = 30000;
const ROLLING_LIMIT = 60;
const DETAIL_POLL_EVERY = 3;

export function resolveSystemMetricsPollIntervalMs({
  hidden,
  lowSpec,
}: {
  hidden: boolean;
  lowSpec: boolean;
}) {
  if (hidden) {
    return lowSpec ? LOW_SPEC_HIDDEN_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS;
  }

  return lowSpec ? LOW_SPEC_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
}

export function shouldPollSystemMetricsDetails({
  pollCount,
  forceDetailed = false,
}: {
  pollCount: number;
  forceDetailed?: boolean;
}) {
  if (forceDetailed) {
    return true;
  }

  return pollCount === 0 || pollCount % DETAIL_POLL_EVERY === 0;
}

export function combineOpenCircuitCount({
  localCount,
  clusterCount,
  previous,
}: {
  localCount: number | null | undefined;
  clusterCount: number | null | undefined;
  previous: number;
}) {
  const nextValue = Number(localCount ?? 0) + Number(clusterCount ?? 0);
  if (!Number.isFinite(nextValue)) {
    return previous;
  }

  return nextValue;
}

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
  rollupRefreshPendingCount: [],
  rollupRefreshRetryCount: [],
  rollupRefreshOldestPendingAgeMs: [],
  aiFailRate: [],
  status401Count: [],
  status403Count: [],
  status429Count: [],
  openCircuitCount: [],
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
  "rollupRefreshPendingCount",
  "rollupRefreshRetryCount",
  "rollupRefreshOldestPendingAgeMs",
  "aiFailRate",
  "status401Count",
  "status403Count",
  "status429Count",
  "openCircuitCount",
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

const endpointStatesEqual = (a: EndpointState, b: EndpointState) =>
  a.health === b.health &&
  a.mode === b.mode &&
  a.workers === b.workers &&
  a.alerts === b.alerts &&
  a.alertHistory === b.alertHistory &&
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

const alertHistoryEqual = (a: MonitorAlertIncident[], b: MonitorAlertIncident[]) => {
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
  const [alertHistory, setAlertHistory] = useState<MonitorAlertIncident[]>([]);
  const [intelligence, setIntelligence] = useState<IntelligenceExplainPayload>(initialIntelligence);
  const [endpointState, setEndpointState] = useState<EndpointState>({
    health: "ok",
    mode: "ok",
    workers: "ok",
    alerts: "ok",
    alertHistory: "ok",
    explain: "ok",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const isLowSpecMode = useMemo(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("low-spec"),
    [],
  );
  const historyRef = useRef(history);
  const snapshotRef = useRef(snapshot);
  const alertsRef = useRef(alerts);
  const alertHistoryRef = useRef(alertHistory);
  const intelligenceRef = useRef(intelligence);
  const endpointStateRef = useRef(endpointState);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const pollControllerRef = useRef<AbortController | null>(null);
  const scheduledPollRef = useRef<number | null>(null);
  const pollCycleRef = useRef(0);
  const visibilityHiddenRef = useRef(
    typeof document !== "undefined" && document.visibilityState === "hidden",
  );
  const scheduleNextPollRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (scheduledPollRef.current !== null) {
        window.clearTimeout(scheduledPollRef.current);
        scheduledPollRef.current = null;
      }
      scheduleNextPollRef.current = null;
      pollControllerRef.current?.abort();
      pollControllerRef.current = null;
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
    alertHistoryRef.current = alertHistory;
  }, [alertHistory]);

  useEffect(() => {
    intelligenceRef.current = intelligence;
  }, [intelligence]);

  useEffect(() => {
    endpointStateRef.current = endpointState;
  }, [endpointState]);

  const clearScheduledPoll = useCallback(() => {
    if (scheduledPollRef.current !== null) {
      window.clearTimeout(scheduledPollRef.current);
      scheduledPollRef.current = null;
    }
  }, []);

  const pollMetrics = useCallback(async ({ forceDetailed = false }: { forceDetailed?: boolean } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController();
    pollControllerRef.current = controller;
    const shouldFetchDetails = shouldPollSystemMetricsDetails({
      pollCount: pollCycleRef.current,
      forceDetailed,
    });
    pollCycleRef.current += 1;

    try {
      const [coreResponses, detailResponses] = await Promise.all([
        Promise.all([
          getSystemHealth({ signal: controller.signal }),
          getSystemMode({ signal: controller.signal }),
          getWorkers({ signal: controller.signal }),
          getAlerts({ signal: controller.signal }),
        ]),
        shouldFetchDetails
          ? Promise.all([
              getAlertHistory({ signal: controller.signal }),
              getIntelligenceExplain({ signal: controller.signal }),
            ])
          : Promise.resolve([null, null] as const),
      ]);

      const [healthRes, modeRes, workersRes, alertsRes] = coreResponses;
      const [alertHistoryRes, explainRes] = detailResponses;

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

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
      const rollupRefreshPendingCount = toFixedNumber(
        Number(healthRes.data?.rollupRefreshPendingCount ?? previous.rollupRefreshPendingCount),
        0,
      );
      const rollupRefreshRunningCount = toFixedNumber(
        Number(healthRes.data?.rollupRefreshRunningCount ?? previous.rollupRefreshRunningCount),
        0,
      );
      const rollupRefreshRetryCount = toFixedNumber(
        Number(healthRes.data?.rollupRefreshRetryCount ?? previous.rollupRefreshRetryCount),
        0,
      );
      const rollupRefreshOldestPendingAgeMs = toFixedNumber(
        Number(healthRes.data?.rollupRefreshOldestPendingAgeMs ?? previous.rollupRefreshOldestPendingAgeMs),
        0,
      );
      const status401Count = toFixedNumber(Number(healthRes.data?.status401Count ?? previous.status401Count), 2);
      const status403Count = toFixedNumber(Number(healthRes.data?.status403Count ?? previous.status403Count), 2);
      const status429Count = toFixedNumber(Number(healthRes.data?.status429Count ?? previous.status429Count), 2);
      const openCircuitCount = toFixedNumber(
        combineOpenCircuitCount({
          localCount: healthRes.data?.localOpenCircuitCount,
          clusterCount: healthRes.data?.clusterOpenCircuitCount,
          previous: previous.openCircuitCount,
        }),
        2,
      );
      const workerCount = Number(workersRes.data?.count ?? healthRes.data?.workerCount ?? previous.workerCount);
      const maxWorkers = Number(workersRes.data?.maxWorkers ?? healthRes.data?.maxWorkers ?? previous.maxWorkers);
      const nextAlerts = alertsRes.data?.alerts ?? alertsRef.current;
      const nextAlertHistory = alertHistoryRes?.data?.incidents ?? alertHistoryRef.current;
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
        rollupRefreshPendingCount,
        rollupRefreshRunningCount,
        rollupRefreshRetryCount,
        rollupRefreshOldestPendingAgeMs,
        aiFailRate,
        status401Count,
        status403Count,
        status429Count,
        openCircuitCount,
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
      const alertHistoryChanged = !alertHistoryEqual(alertHistoryRef.current, nextAlertHistory);
      const nextIntelligence = explainRes?.data ?? intelligenceRef.current;
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
      if (alertHistoryChanged) {
        if (mountedRef.current) {
          setAlertHistory(nextAlertHistory);
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
        alertHistory: alertHistoryRes?.state ?? endpointStateRef.current.alertHistory,
        explain: explainRes?.state ?? endpointStateRef.current.explain,
      };
      const endpointChanged = !endpointStatesEqual(endpointStateRef.current, nextEndpointState);
      if (endpointChanged) {
        if (mountedRef.current) {
          setEndpointState(nextEndpointState);
        }
      }

      if (mountedRef.current && (snapshotChanged || alertsChanged || alertHistoryChanged || intelligenceChanged || endpointChanged || historyChanged)) {
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
      if (pollControllerRef.current === controller) {
        pollControllerRef.current = null;
      }
      inFlightRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const scheduleNextPoll = () => {
      clearScheduledPoll();
      if (!mountedRef.current) {
        return;
      }

      const delay = resolveSystemMetricsPollIntervalMs({
        hidden: visibilityHiddenRef.current,
        lowSpec: isLowSpecMode,
      });

      scheduledPollRef.current = window.setTimeout(() => {
        void pollMetrics();
      }, delay);
    };

    scheduleNextPollRef.current = scheduleNextPoll;

    const runPoll = async (forceDetailed = false) => {
      await pollMetrics({ forceDetailed });
      if (!mountedRef.current) {
        return;
      }

      scheduleNextPoll();
    };

    const handleVisibilityChange = () => {
      visibilityHiddenRef.current = document.visibilityState === "hidden";
      clearScheduledPoll();

      if (visibilityHiddenRef.current) {
        scheduleNextPoll();
        return;
      }

      void runPoll(true);
    };

    void runPoll(true);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      scheduleNextPollRef.current = null;
      clearScheduledPoll();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [clearScheduledPoll, isLowSpecMode, pollMetrics]);

  const refreshNow = useCallback(async () => {
    clearScheduledPoll();
    await pollMetrics({ forceDetailed: true });
    scheduleNextPollRef.current?.();
  }, [clearScheduledPoll, pollMetrics]);

  const accessDenied = useMemo(
    () =>
      endpointState.health === "forbidden" ||
      endpointState.mode === "forbidden" ||
      endpointState.workers === "forbidden" ||
      endpointState.alerts === "forbidden" ||
      endpointState.alertHistory === "forbidden" ||
      endpointState.explain === "forbidden" ||
      endpointState.health === "unauthorized" ||
      endpointState.mode === "unauthorized" ||
      endpointState.workers === "unauthorized" ||
      endpointState.alerts === "unauthorized" ||
      endpointState.alertHistory === "unauthorized" ||
      endpointState.explain === "unauthorized",
    [endpointState],
  );

  const hasNetworkFailure = useMemo(
    () =>
      endpointState.health === "network_error" ||
      endpointState.mode === "network_error" ||
      endpointState.workers === "network_error" ||
      endpointState.alerts === "network_error" ||
      endpointState.alertHistory === "network_error" ||
      endpointState.explain === "network_error",
    [endpointState],
  );

  return {
    isLoading,
    lastUpdated,
    snapshot,
    history,
    alerts,
    alertHistory,
    intelligence,
    endpointState,
    accessDenied,
    hasNetworkFailure,
    refreshNow,
  };
}
