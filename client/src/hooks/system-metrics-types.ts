import type {
  IntelligenceExplainPayload,
  MonitorAlert,
  MonitorAlertIncident,
  MonitorRequestState,
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

export type EndpointState = {
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

export type UseSystemMetricsResult = {
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
