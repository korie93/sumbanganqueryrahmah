export type MonitorRequestState = "ok" | "unauthorized" | "forbidden" | "network_error";

export type MonitorRequestOptions = {
  signal?: AbortSignal;
};

export type AlertHistoryRequestOptions = MonitorRequestOptions & {
  page?: number;
  pageSize?: number;
};

export type AlertsRequestOptions = MonitorRequestOptions & {
  page?: number;
  pageSize?: number;
};

export type MonitorApiResult<T> = {
  state: MonitorRequestState;
  status: number;
  data: T | null;
  message: string | null;
};

export type MonitorAlert = {
  id: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  timestamp: string;
  source?: string;
};

export type MonitorAlertIncident = {
  id: string;
  alertKey: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  source: string | null;
  message: string;
  status: "open" | "resolved";
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  updatedAt: string;
};

export type MonitorPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type SystemHealthPayload = {
  score: number;
  mode: string;
  cpuPercent: number;
  ramPercent: number;
  p95LatencyMs: number;
  errorRate: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  eventLoopLagMs: number;
  requestRate: number;
  activeRequests: number;
  queueLength: number;
  workerCount: number;
  maxWorkers: number;
  dbProtection: boolean;
  slowQueryCount: number;
  dbConnections: number;
  aiFailRate: number;
  status401Count: number;
  status403Count: number;
  status429Count: number;
  localOpenCircuitCount: number;
  clusterOpenCircuitCount: number;
  bottleneckType: string;
  rollupRefreshPendingCount: number;
  rollupRefreshRunningCount: number;
  rollupRefreshRetryCount: number;
  rollupRefreshOldestPendingAgeMs: number;
  activeAlertCount: number;
  updatedAt: number;
};

export type SystemModePayload = {
  mode: string;
  throttleFactor: number;
  rejectHeavyRoutes: boolean;
  dbProtection: boolean;
  preAllocatedMB: number;
  updatedAt: number;
};

export type WorkerSnapshot = {
  workerId: number;
  pid: number;
  cpuPercent: number;
  reqRate: number;
  latencyP95Ms: number;
  eventLoopLagMs: number;
  activeRequests: number;
  heapUsedMB: number;
  oldSpaceMB: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  ts: number;
};

export type WorkersPayload = {
  count: number;
  maxWorkers: number;
  workers: WorkerSnapshot[];
  updatedAt: number;
};

export type AlertsPayload = {
  alerts: MonitorAlert[];
  pagination: MonitorPagination;
  updatedAt: number;
};

export type AlertHistoryPayload = {
  incidents: MonitorAlertIncident[];
  pagination: MonitorPagination;
  updatedAt: string;
};

export type AlertHistoryCleanupPayload = {
  ok: boolean;
  deletedCount: number;
  olderThanDays: number;
  updatedAt: string;
};

export type GovernanceState =
  | "IDLE"
  | "PROPOSED"
  | "CONSENSUS_PENDING"
  | "EXECUTED"
  | "COOLDOWN"
  | "LOCKDOWN"
  | "FAIL_SAFE";

export type StrategyDecision = {
  strategy: "CONSERVATIVE" | "AGGRESSIVE" | "ADAPTIVE";
  recommendedAction: "NONE" | "ENABLE_THROTTLE_MODE" | "PAUSE_AI_QUEUE" | "REDUCE_WORKER_COUNT" | "SELECTIVE_WORKER_RESTART";
  confidenceScore: number;
  reason: string;
};

export type IntelligenceExplainPayload = {
  anomalyBreakdown: {
    normalizedZScore: number;
    slopeWeight: number;
    percentileShift: number;
    correlationWeight: number;
    forecastRisk: number;
    mutationFactor: number;
    weightedScore: number;
  };
  correlationMatrix: {
    cpuToLatency: number;
    dbToErrors: number;
    aiToQueue: number;
    boostedPairs: string[];
  };
  slopeValues: Record<string, number>;
  forecastProjection: number[];
  governanceState: GovernanceState;
  chosenStrategy: StrategyDecision;
  decisionReason: string;
};

export type ChaosType = "cpu_spike" | "db_latency_spike" | "ai_delay" | "worker_crash" | "memory_pressure";

export type ChaosInjectPayload = {
  type: ChaosType;
  magnitude?: number;
  durationMs?: number;
};

export type ChaosEventPayload = {
  id: string;
  type: ChaosType;
  magnitude: number;
  createdAt: number;
  expiresAt: number;
};

export type ChaosInjectResponse = {
  success: boolean;
  injected: ChaosEventPayload;
  active: ChaosEventPayload[];
};

export type RollupQueueActionPayload = {
  ok: boolean;
  action: string;
  message: string;
  requeuedCount?: number;
  snapshot: {
    pendingCount: number;
    runningCount: number;
    retryCount: number;
    oldestPendingAgeMs: number;
  };
};
