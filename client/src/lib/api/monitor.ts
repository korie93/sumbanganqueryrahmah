import { createApiHeaders } from "../api-client";
import { getAuthHeader, getCsrfHeader } from "./shared";

export type MonitorRequestState = "ok" | "unauthorized" | "forbidden" | "network_error";
type MonitorRequestOptions = {
  signal?: AbortSignal;
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
  updatedAt: number;
};

export type AlertHistoryPayload = {
  incidents: MonitorAlertIncident[];
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

async function parseMonitorErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return response.statusText || "Request failed";
    try {
      const parsed = JSON.parse(text);
      return String(parsed?.message || parsed?.error || text);
    } catch {
      return text;
    }
  } catch {
    return response.statusText || "Request failed";
  }
}

async function fetchMonitorEndpoint<T>(
  endpoint: string,
  options?: MonitorRequestOptions,
): Promise<MonitorApiResult<T>> {
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: createApiHeaders({
        ...getAuthHeader(),
      }),
      credentials: "include",
      signal: options?.signal,
    });

    if (response.status === 401) {
      return {
        state: "unauthorized",
        status: 401,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (response.status === 403) {
      return {
        state: "forbidden",
        status: 403,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (!response.ok) {
      return {
        state: "network_error",
        status: response.status,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    const data = (await response.json()) as T;
    return {
      state: "ok",
      status: 200,
      data,
      message: null,
    };
  } catch (error: unknown) {
    return {
      state: "network_error",
      status: 0,
      data: null,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

async function postMonitorEndpoint<T>(
  endpoint: string,
  body: unknown,
  options?: MonitorRequestOptions,
): Promise<MonitorApiResult<T>> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: createApiHeaders({
        "Content-Type": "application/json",
        ...getAuthHeader(),
        ...(getCsrfHeader() as Record<string, string>),
      }),
      credentials: "include",
      body: JSON.stringify(body ?? {}),
      signal: options?.signal,
    });

    if (response.status === 401) {
      return {
        state: "unauthorized",
        status: 401,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (response.status === 403) {
      return {
        state: "forbidden",
        status: 403,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (!response.ok) {
      return {
        state: "network_error",
        status: response.status,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    const data = (await response.json()) as T;
    return {
      state: "ok",
      status: 200,
      data,
      message: null,
    };
  } catch (error: unknown) {
    return {
      state: "network_error",
      status: 0,
      data: null,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getSystemHealth(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<SystemHealthPayload>("/internal/system-health", options);
}

export async function getSystemMode(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<SystemModePayload>("/internal/system-mode", options);
}

export async function getWorkers(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<WorkersPayload>("/internal/workers", options);
}

export async function getAlerts(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<AlertsPayload>("/internal/alerts", options);
}

export async function getAlertHistory(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<AlertHistoryPayload>("/internal/alerts/history", options);
}

export async function getIntelligenceExplain(options?: MonitorRequestOptions) {
  return fetchMonitorEndpoint<IntelligenceExplainPayload>("/internal/intelligence/explain", options);
}

export async function injectChaos(payload: ChaosInjectPayload, options?: MonitorRequestOptions) {
  return postMonitorEndpoint<ChaosInjectResponse>("/internal/chaos/inject", payload, options);
}

export async function drainRollupQueue(options?: MonitorRequestOptions) {
  return postMonitorEndpoint<RollupQueueActionPayload>("/internal/rollup-refresh/drain", {}, options);
}

export async function retryRollupFailures(options?: MonitorRequestOptions) {
  return postMonitorEndpoint<RollupQueueActionPayload>("/internal/rollup-refresh/retry-failures", {}, options);
}

export async function autoHealRollupQueue(options?: MonitorRequestOptions) {
  return postMonitorEndpoint<RollupQueueActionPayload>("/internal/rollup-refresh/auto-heal", {}, options);
}

export async function rebuildCollectionRollups(options?: MonitorRequestOptions) {
  return postMonitorEndpoint<RollupQueueActionPayload>("/internal/rollup-refresh/rebuild", {}, options);
}

export async function generateFingerprint(): Promise<string> {
  const data = [
    navigator.userAgent,
    navigator.platform,
    navigator.vendor,
    screen.width + "x" + screen.height,
    navigator.language,
  ].join("||");

  if (crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fall through to simple hash
    }
  }

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}
