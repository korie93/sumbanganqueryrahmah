import {
  type IntelligenceExplainPayload,
  type MonitorAlert,
  type MonitorAlertIncident,
  type MonitorPagination,
  type WebVitalOverviewPayload,
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
  monitorPaginationEqual,
  shouldFetchSystemMetricsDetails,
  snapshotsEqual,
  toFixedNumber,
  webVitalsOverviewEqual,
} from "@/hooks/system-metrics-utils";

export type SystemMetricsPollingState = {
  snapshot: MonitorSnapshot;
  history: MonitorHistory;
  alerts: MonitorAlert[];
  alertsPagination: MonitorPagination;
  alertHistory: MonitorAlertIncident[];
  alertHistoryPagination: MonitorPagination;
  intelligence: IntelligenceExplainPayload;
  webVitalsOverview: WebVitalOverviewPayload;
  endpointState: EndpointState;
};

export type SystemMetricsPollingFlags = {
  hidden: boolean;
  forceDetailed?: boolean;
  pollCount: number;
  includeHistory: boolean;
  includeAlerts: boolean;
  alertsPage: number;
  alertsPageSize: number;
  includeAlertHistory: boolean;
  alertHistoryPage: number;
  alertHistoryPageSize: number;
  includeIntelligence: boolean;
  includeWebVitalsOverview: boolean;
};

export type SystemMetricsPollResult = {
  nextState: SystemMetricsPollingState;
  changed: boolean;
  lastUpdated: number | null;
};

export async function pollSystemMetricsOnce(
  current: SystemMetricsPollingState,
  flags: SystemMetricsPollingFlags,
  signal: AbortSignal,
): Promise<SystemMetricsPollResult> {
  const shouldFetchDetails = shouldFetchSystemMetricsDetails({
    hidden: flags.hidden,
    pollCount: flags.pollCount,
    forceDetailed: flags.forceDetailed,
  });

  const [coreResponses, detailResponses] = await Promise.all([
    Promise.all([
      getSystemHealth({ signal }),
      getSystemMode({ signal }),
      getWorkers({ signal }),
      flags.includeAlerts
        ? getAlerts({
            signal,
            page: flags.alertsPage,
            pageSize: flags.alertsPageSize,
          })
        : Promise.resolve(null),
    ]),
    shouldFetchDetails
      ? Promise.all([
          flags.includeAlertHistory
            ? getAlertHistory({
                signal,
                page: flags.alertHistoryPage,
                pageSize: flags.alertHistoryPageSize,
              })
            : Promise.resolve(null),
          flags.includeIntelligence
            ? getIntelligenceExplain({ signal })
            : Promise.resolve(null),
          flags.includeWebVitalsOverview
            ? getWebVitalsOverview({ signal })
            : Promise.resolve(null),
        ])
      : Promise.resolve([null, null, null] as const),
  ]);

  const [healthRes, modeRes, workersRes, alertsRes] = coreResponses;
  const [alertHistoryRes, explainRes, webVitalsRes] = detailResponses;
  const previous = current.snapshot;
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
  const nextAlerts = alertsRes?.data?.alerts ?? current.alerts;
  const nextAlertsPagination = alertsRes?.data?.pagination ?? current.alertsPagination;
  const nextAlertHistory = alertHistoryRes?.data?.incidents ?? current.alertHistory;
  const nextAlertHistoryPagination = alertHistoryRes?.data?.pagination ?? current.alertHistoryPagination;
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
  const nextHistory = flags.includeHistory
    ? appendHistorySnapshot(current.history, nextSnapshot, now)
    : current.history;
  const historyChanged = flags.includeHistory && nextHistory !== current.history;

  const snapshotChanged = !snapshotsEqual(current.snapshot, nextSnapshot);
  const alertsChanged = !alertsEqual(current.alerts, nextAlerts);
  const alertsPaginationChanged = !monitorPaginationEqual(current.alertsPagination, nextAlertsPagination);
  const alertHistoryChanged = !alertHistoryEqual(current.alertHistory, nextAlertHistory);
  const alertHistoryPaginationChanged = !monitorPaginationEqual(
    current.alertHistoryPagination,
    nextAlertHistoryPagination,
  );
  const nextIntelligence = explainRes?.data ?? current.intelligence;
  const intelligenceChanged = !explainabilityEqual(current.intelligence, nextIntelligence);
  const nextWebVitalsOverview = webVitalsRes?.data ?? current.webVitalsOverview;
  const webVitalsChanged = !webVitalsOverviewEqual(current.webVitalsOverview, nextWebVitalsOverview);

  const nextEndpointState: EndpointState = {
    health: healthRes.state,
    mode: modeRes.state,
    workers: workersRes.state,
    alerts: flags.includeAlerts ? (alertsRes?.state ?? current.endpointState.alerts) : "ok",
    alertHistory: flags.includeAlertHistory ? (alertHistoryRes?.state ?? current.endpointState.alertHistory) : "ok",
    webVitals: flags.includeWebVitalsOverview ? (webVitalsRes?.state ?? current.endpointState.webVitals) : "ok",
    explain: flags.includeIntelligence ? (explainRes?.state ?? current.endpointState.explain) : "ok",
  };
  const endpointChanged = !endpointStatesEqual(current.endpointState, nextEndpointState);

  const changed =
    snapshotChanged ||
    alertsChanged ||
    alertsPaginationChanged ||
    alertHistoryChanged ||
    alertHistoryPaginationChanged ||
    intelligenceChanged ||
    webVitalsChanged ||
    endpointChanged ||
    historyChanged;

  const alertHistoryUpdatedAt = alertHistoryRes?.data?.updatedAt
    ? Date.parse(alertHistoryRes.data.updatedAt)
    : null;
  const responseTsCandidates = [
    healthRes.data?.updatedAt,
    modeRes.data?.updatedAt,
    workersRes.data?.updatedAt,
    alertsRes?.data?.updatedAt,
    alertHistoryUpdatedAt,
    now,
  ];
  const responseTs = changed
    ? (responseTsCandidates.find((value) => Number.isFinite(value)) ?? now)
    : null;

  return {
    nextState: {
      snapshot: snapshotChanged ? nextSnapshot : current.snapshot,
      history: historyChanged ? nextHistory : current.history,
      alerts: alertsChanged ? nextAlerts : current.alerts,
      alertsPagination: alertsPaginationChanged ? nextAlertsPagination : current.alertsPagination,
      alertHistory: alertHistoryChanged ? nextAlertHistory : current.alertHistory,
      alertHistoryPagination: alertHistoryPaginationChanged
        ? nextAlertHistoryPagination
        : current.alertHistoryPagination,
      intelligence: intelligenceChanged ? nextIntelligence : current.intelligence,
      webVitalsOverview: webVitalsChanged ? nextWebVitalsOverview : current.webVitalsOverview,
      endpointState: endpointChanged ? nextEndpointState : current.endpointState,
    },
    changed,
    lastUpdated: responseTs,
  };
}

export function deriveSystemMetricsAccessDenied(endpointState: EndpointState) {
  return endpointState.health === "forbidden" ||
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
    endpointState.explain === "unauthorized";
}

export function deriveSystemMetricsHasNetworkFailure(endpointState: EndpointState) {
  return endpointState.health === "network_error" ||
    endpointState.mode === "network_error" ||
    endpointState.workers === "network_error" ||
    endpointState.alerts === "network_error" ||
    endpointState.alertHistory === "network_error" ||
    endpointState.webVitals === "network_error" ||
    endpointState.explain === "network_error";
}
