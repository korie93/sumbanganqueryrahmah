import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type IntelligenceExplainPayload,
  type MonitorAlert,
  type MonitorAlertIncident,
  getAlertHistory,
  getAlerts,
  getIntelligenceExplain,
  getSystemHealth,
  getSystemMode,
  getWebVitalsOverview,
  getWorkers,
} from "@/lib/api";
import type {
  EndpointState,
  MonitorHistory,
  MonitorSnapshot,
  UseSystemMetricsResult,
} from "@/hooks/system-metrics-types";
import {
  alertHistoryEqual,
  alertsEqual,
  appendHistorySnapshot,
  combineOpenCircuitCount,
  deriveBottleneck,
  deriveP95Latency,
  deriveRamPercent,
  deriveSlowQueries,
  endpointStatesEqual,
  explainabilityEqual,
  initialHistory,
  initialIntelligence,
  initialSnapshot,
  initialWebVitalsOverview,
  resolveSystemMetricsPollIntervalMs,
  shouldFetchSystemMetricsDetails,
  shouldPollSystemMetricsDetails,
  snapshotsEqual,
  toFixedNumber,
  webVitalsOverviewEqual,
} from "@/hooks/system-metrics-utils";

export type {
  HistoryKey,
  SeriesPoint,
  MonitorHistory,
  MonitorSnapshot,
  UseSystemMetricsResult,
} from "@/hooks/system-metrics-types";
export {
  combineOpenCircuitCount,
  resolveSystemMetricsPollIntervalMs,
  shouldFetchSystemMetricsDetails,
  shouldPollSystemMetricsDetails,
} from "@/hooks/system-metrics-utils";

type UseSystemMetricsOptions = {
  includeWebVitalsOverview?: boolean;
};

export function useSystemMetrics(options: UseSystemMetricsOptions = {}): UseSystemMetricsResult {
  const includeWebVitalsOverview = options.includeWebVitalsOverview ?? true;
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(initialSnapshot);
  const [history, setHistory] = useState<MonitorHistory>(initialHistory);
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<MonitorAlertIncident[]>([]);
  const [intelligence, setIntelligence] = useState<IntelligenceExplainPayload>(initialIntelligence);
  const [webVitalsOverview, setWebVitalsOverview] = useState(initialWebVitalsOverview);
  const [endpointState, setEndpointState] = useState<EndpointState>({
    health: "ok",
    mode: "ok",
    workers: "ok",
    alerts: "ok",
    alertHistory: "ok",
    webVitals: "ok",
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
  const webVitalsOverviewRef = useRef(webVitalsOverview);
  const includeWebVitalsOverviewRef = useRef(includeWebVitalsOverview);
  const previousIncludeWebVitalsOverviewRef = useRef(includeWebVitalsOverview);
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
    webVitalsOverviewRef.current = webVitalsOverview;
  }, [webVitalsOverview]);

  useEffect(() => {
    includeWebVitalsOverviewRef.current = includeWebVitalsOverview;
  }, [includeWebVitalsOverview]);

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
    const shouldFetchDetails = shouldFetchSystemMetricsDetails({
      hidden: visibilityHiddenRef.current,
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
              includeWebVitalsOverviewRef.current
                ? getWebVitalsOverview({ signal: controller.signal })
                : Promise.resolve(null),
            ])
          : Promise.resolve([null, null, null] as const),
      ]);

      const [healthRes, modeRes, workersRes, alertsRes] = coreResponses;
      const [alertHistoryRes, explainRes, webVitalsRes] = detailResponses;

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
      const nextWebVitalsOverview = webVitalsRes?.data ?? webVitalsOverviewRef.current;
      const webVitalsChanged = !webVitalsOverviewEqual(webVitalsOverviewRef.current, nextWebVitalsOverview);
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
      if (webVitalsChanged) {
        if (mountedRef.current) {
          setWebVitalsOverview(nextWebVitalsOverview);
        }
      }

      const nextEndpointState: EndpointState = {
        health: healthRes.state,
        mode: modeRes.state,
        workers: workersRes.state,
        alerts: alertsRes.state,
        alertHistory: alertHistoryRes?.state ?? endpointStateRef.current.alertHistory,
        webVitals: webVitalsRes?.state ?? endpointStateRef.current.webVitals,
        explain: explainRes?.state ?? endpointStateRef.current.explain,
      };
      const endpointChanged = !endpointStatesEqual(endpointStateRef.current, nextEndpointState);
      if (endpointChanged) {
        if (mountedRef.current) {
          setEndpointState(nextEndpointState);
        }
      }

      if (mountedRef.current && (snapshotChanged || alertsChanged || alertHistoryChanged || intelligenceChanged || webVitalsChanged || endpointChanged || historyChanged)) {
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

  useEffect(() => {
    if (includeWebVitalsOverview && !previousIncludeWebVitalsOverviewRef.current) {
      void refreshNow();
    }

    previousIncludeWebVitalsOverviewRef.current = includeWebVitalsOverview;
  }, [includeWebVitalsOverview, refreshNow]);

  const accessDenied = useMemo(
    () =>
      endpointState.health === "forbidden" ||
      endpointState.mode === "forbidden" ||
      endpointState.workers === "forbidden" ||
      endpointState.alerts === "forbidden" ||
      endpointState.alertHistory === "forbidden" ||
      endpointState.webVitals === "forbidden" ||
      endpointState.explain === "forbidden" ||
      endpointState.health === "unauthorized" ||
      endpointState.mode === "unauthorized" ||
      endpointState.workers === "unauthorized" ||
      endpointState.alerts === "unauthorized" ||
      endpointState.alertHistory === "unauthorized" ||
      endpointState.webVitals === "unauthorized" ||
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
      endpointState.webVitals === "network_error" ||
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
    webVitalsOverview,
    endpointState,
    accessDenied,
    hasNetworkFailure,
    refreshNow,
  };
}
