import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type MonitorAlert,
  type MonitorRequestState,
  getAlerts,
  getSystemHealth,
  getSystemMode,
  getWorkers,
} from "@/lib/api";

type HistoryKey =
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

type EndpointState = {
  health: MonitorRequestState;
  mode: MonitorRequestState;
  workers: MonitorRequestState;
  alerts: MonitorRequestState;
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
  history: Record<HistoryKey, SeriesPoint[]>;
  alerts: MonitorAlert[];
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

const initialHistory: Record<HistoryKey, SeriesPoint[]> = {
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
  a.health === b.health && a.mode === b.mode && a.workers === b.workers && a.alerts === b.alerts;

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

export function useSystemMetrics(): UseSystemMetricsResult {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(initialSnapshot);
  const [history, setHistory] = useState<Record<HistoryKey, SeriesPoint[]>>(initialHistory);
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [endpointState, setEndpointState] = useState<EndpointState>({
    health: "ok",
    mode: "ok",
    workers: "ok",
    alerts: "ok",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const historyRef = useRef(history);
  const snapshotRef = useRef(snapshot);
  const alertsRef = useRef(alerts);
  const endpointStateRef = useRef(endpointState);
  const inFlightRef = useRef(false);

  const appendSeries = useCallback((key: HistoryKey, value: number, ts: number) => {
    const current = historyRef.current[key];
    const last = current[current.length - 1];
    if (last && last.value === value) return false;
    const nextSeries = current.length >= ROLLING_LIMIT
      ? [...current.slice(current.length - ROLLING_LIMIT + 1), { ts, value }]
      : [...current, { ts, value }];
    historyRef.current = {
      ...historyRef.current,
      [key]: nextSeries,
    };
    return true;
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    endpointStateRef.current = endpointState;
  }, [endpointState]);

  const pollMetrics = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const [healthRes, modeRes, workersRes, alertsRes] = await Promise.all([
        getSystemHealth(),
        getSystemMode(),
        getWorkers(),
        getAlerts(),
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
      let historyChanged = false;
      historyChanged = appendSeries("cpuPercent", nextSnapshot.cpuPercent, now) || historyChanged;
      historyChanged = appendSeries("ramPercent", nextSnapshot.ramPercent, now) || historyChanged;
      historyChanged = appendSeries("eventLoopLagMs", nextSnapshot.eventLoopLagMs, now) || historyChanged;
      historyChanged = appendSeries("workerCount", nextSnapshot.workerCount, now) || historyChanged;
      historyChanged = appendSeries("requestsPerSec", nextSnapshot.requestsPerSec, now) || historyChanged;
      historyChanged = appendSeries("p95LatencyMs", nextSnapshot.p95LatencyMs, now) || historyChanged;
      historyChanged = appendSeries("errorRate", nextSnapshot.errorRate, now) || historyChanged;
      historyChanged = appendSeries("activeRequests", nextSnapshot.activeRequests, now) || historyChanged;
      historyChanged = appendSeries("avgQueryTimeMs", nextSnapshot.avgQueryTimeMs, now) || historyChanged;
      historyChanged = appendSeries("slowQueryCount", nextSnapshot.slowQueryCount, now) || historyChanged;
      historyChanged = appendSeries("connections", nextSnapshot.connections, now) || historyChanged;
      historyChanged = appendSeries("aiLatencyMs", nextSnapshot.aiLatencyMs, now) || historyChanged;
      historyChanged = appendSeries("queueSize", nextSnapshot.queueSize, now) || historyChanged;
      historyChanged = appendSeries("aiFailRate", nextSnapshot.aiFailRate, now) || historyChanged;

      if (historyChanged) {
        setHistory(historyRef.current);
      }

      const snapshotChanged = !snapshotsEqual(snapshotRef.current, nextSnapshot);
      const alertsChanged = !alertsEqual(alertsRef.current, nextAlerts);
      if (snapshotChanged) {
        setSnapshot(nextSnapshot);
      }
      if (alertsChanged) {
        setAlerts(nextAlerts);
      }

      const nextEndpointState: EndpointState = {
        health: healthRes.state,
        mode: modeRes.state,
        workers: workersRes.state,
        alerts: alertsRes.state,
      };
      const endpointChanged = !endpointStatesEqual(endpointStateRef.current, nextEndpointState);
      if (endpointChanged) {
        setEndpointState(nextEndpointState);
      }

      if (snapshotChanged || alertsChanged || endpointChanged || historyChanged) {
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
      setIsLoading(false);
    }
  }, [appendSeries]);

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
      endpointState.health === "unauthorized" ||
      endpointState.mode === "unauthorized" ||
      endpointState.workers === "unauthorized" ||
      endpointState.alerts === "unauthorized",
    [endpointState],
  );

  const hasNetworkFailure = useMemo(
    () =>
      endpointState.health === "network_error" ||
      endpointState.mode === "network_error" ||
      endpointState.workers === "network_error" ||
      endpointState.alerts === "network_error",
    [endpointState],
  );

  return {
    isLoading,
    lastUpdated,
    snapshot,
    history,
    alerts,
    endpointState,
    accessDenied,
    hasNetworkFailure,
  };
}
