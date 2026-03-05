import { apiRequest } from "./queryClient";

const getAuthHeader = (): HeadersInit => {
  const token = localStorage.getItem("token");
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
};

const API_BASE = "";

export async function login(username: string, password: string, fingerprint?: string) {
  const res = await fetch(`/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", // ✅ SAHAJA
    },
    body: JSON.stringify({
      username: username.toLowerCase().trim(),
      password,
      fingerprint,
      browser: navigator.userAgent,
    }),
    credentials: "include",
  });

  const data = await res.json();

  if (data.banned) {
    return { banned: true };
  }

  if (!res.ok) {
    throw new Error(data.message || "Login failed");
  }

  return data;
}

export async function checkHealth() {
  const response = await fetch(`${API_BASE}/api/health`);
  return response.json();
}

export async function activityLogin(data: {
  username: string;
  role: string;
  pcName?: string;
  browser?: string;
  fingerprint?: string;
}) {
  const token = localStorage.getItem("token");
  const response = await apiRequest("POST", "/api/activity/login", data);
  return response.json();
}

export async function activityLogout(activityId: string) {
  const response = await apiRequest("POST", "/api/activity/logout", { activityId });
  return response.json();
}

export async function activityHeartbeat(payload?: {
  activityId?: string;
  pcName?: string;
  browser?: string;
  fingerprint?: string;
}) {
  const token = localStorage.getItem("token");
  if (!token) return;

  return fetch("/api/activity/heartbeat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
}

export async function activityHeartbeatLight() {
  const token = localStorage.getItem("token");
  if (!token) return;

  return fetch("/api/activity/heartbeat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getAllActivity() {
  const response = await apiRequest("GET", "/api/activity/all");
  return response.json();
}

export interface ActivityFilters {
  status?: string[];
  username?: string;
  ipAddress?: string;
  browser?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getFilteredActivity(filters: ActivityFilters) {
  const params = new URLSearchParams();
  if (filters.status && filters.status.length > 0) {
    params.set("status", filters.status.join(","));
  }
  if (filters.username) params.set("username", filters.username);
  if (filters.ipAddress) params.set("ipAddress", filters.ipAddress);
  if (filters.browser) params.set("browser", filters.browser);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  const queryString = params.toString();
  const url = queryString ? `/api/activity/filter?${queryString}` : "/api/activity/filter";
  const response = await apiRequest("GET", url);
  return response.json();
}

export async function deleteActivityLog(activityId: string) {
  const response = await apiRequest("DELETE", `/api/activity/${activityId}`);
  return response.json();
}

export async function kickUser(activityId: string) {
  const response = await apiRequest("POST", "/api/activity/kick", { activityId });
  return response.json();
}

export async function banUser(activityId: string) {
  const response = await apiRequest("POST", "/api/activity/ban", { activityId });
  return response.json();
}

export async function unbanUser(banId: string) {
  const response = await apiRequest("POST", "/api/admin/unban", {
    banId
  });
  return response.json();
}

export async function getBannedUsers() {
  const response = await apiRequest("GET", "/api/users/banned");
  return response.json();
}

export async function getImports() {
  const response = await apiRequest("GET", "/api/imports");
  return response.json();
}

export async function createImport(name: string, filename: string, data: any[]) {
  const response = await apiRequest("POST", "/api/imports", { name, filename, data });
  return response.json();
}

export async function deleteImport(id: string) {
  const response = await apiRequest("DELETE", `/api/imports/${id}`);
  return response.json();
}

export async function renameImport(id: string, name: string) {
  const response = await apiRequest("PATCH", `/api/imports/${id}/rename`, { name });
  return response.json();
}

export async function getImportData(
  id: string,
  page: number = 1,
  limit: number = 100,
  search?: string
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (search && search.trim() !== "") {
    params.set("search", search.trim());
  }

  const response = await apiRequest(
    "GET",
    `/api/imports/${id}/data?${params.toString()}`
  );

  return response.json();
}

export async function analyzeImport(id: string) {
  const response = await apiRequest("GET", `/api/imports/${id}/analyze`);
  return response.json();
}

export async function analyzeAll() {
  const response = await apiRequest("GET", "/api/analyze/all");
  return response.json();
}

export async function searchData(query: string, page: number = 1, limit: number = 50) {
  const res = await fetch(
    `/api/search/global?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
    {
      headers: {
        ...getAuthHeader(),
      },
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Search failed");
  }

  return res.json();
}

export interface SearchFilter {
  field: string;
  operator: string;
  value: string;
}

export async function advancedSearchData(
  filters: SearchFilter[],
  logic: "AND" | "OR",
  page: number = 1,
  limit: number = 50
) {
  const response = await apiRequest("POST", "/api/search/advanced", { filters, logic, page, limit });
  return response.json();
}

export async function getSearchColumns() {
  const response = await apiRequest("GET", "/api/search/columns");
  return response.json();
}

export async function getAuditLogs() {
  const response = await apiRequest("GET", "/api/audit-logs");
  return response.json();
}

export async function getAuditLogStats() {
  const response = await apiRequest("GET", "/api/audit-logs/stats");
  return response.json();
}

export async function cleanupAuditLogs(olderThanDays: number) {
  const response = await apiRequest("DELETE", "/api/audit-logs/cleanup", { olderThanDays });
  return response.json();
}

export async function createBackup(name: string) {
  const response = await apiRequest("POST", "/api/backups", { name });
  return response.json();
}

export async function getBackups() {
  const response = await apiRequest("GET", "/api/backups");
  return response.json();
}

export async function getBackupById(id: string) {
  const response = await apiRequest("GET", `/api/backups/${id}`);
  return response.json();
}

export async function restoreBackup(id: string) {
  const response = await apiRequest("POST", `/api/backups/${id}/restore`);
  return response.json();
}

export async function deleteBackup(id: string) {
  const response = await apiRequest("DELETE", `/api/backups/${id}`);
  return response.json();
}

export async function aiChat(message: string, conversationId?: string | null) {
  const response = await apiRequest("POST", "/api/ai/chat", {
    message,
    conversationId: conversationId || null,
  });
  return response.json();
}

export async function getAiConfig() {
  const response = await apiRequest("GET", "/api/ai/config");
  return response.json();
}

export async function getSettings() {
  const response = await apiRequest("GET", "/api/settings");
  return response.json();
}

export type CurrentUser = {
  id: string;
  username: string;
  role: string;
};

export async function getMe(): Promise<CurrentUser> {
  const response = await apiRequest("GET", "/api/me");
  return response.json();
}

export async function updateMyCredentials(payload: {
  newUsername?: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  const response = await apiRequest("PATCH", "/api/me/credentials", payload);
  return response.json();
}

export async function getSuperuserManagedUsers(): Promise<{
  ok: boolean;
  users: Array<{ id: string; username: string; role: string }>;
}> {
  const response = await apiRequest("GET", "/api/admin/users");
  return response.json();
}

export async function updateSuperuserManagedUserCredentials(
  userId: string,
  payload: { newUsername?: string; newPassword?: string },
) {
  const response = await apiRequest("PATCH", `/api/admin/users/${encodeURIComponent(userId)}/credentials`, payload);
  return response.json();
}

export async function getAppConfig() {
  const response = await apiRequest("GET", "/api/app-config");
  return response.json();
}

export async function getTabVisibility() {
  const response = await apiRequest("GET", "/api/settings/tab-visibility");
  return response.json();
}

export async function updateSetting(payload: {
  key: string;
  value: string | number | boolean | null;
  confirmCritical?: boolean;
}) {
  const response = await apiRequest("PATCH", "/api/settings", payload);
  return response.json();
}

export async function getMaintenanceStatus() {
  const response = await fetch("/api/maintenance-status", {
    credentials: "include",
    headers: {
      ...getAuthHeader(),
    },
  });
  return response.json();
}

export async function aiIndexImport(importId: string, batchSize: number, maxRows?: number) {
  const response = await apiRequest("POST", `/api/ai/index/import/${importId}`, {
    batchSize,
    maxRows,
  });
  return response.json();
}

// Analytics API
export async function getAnalyticsSummary() {
  const response = await apiRequest("GET", "/api/analytics/summary");
  return response.json();
}

export async function getLoginTrends(days: number = 7) {
  const response = await apiRequest("GET", `/api/analytics/login-trends?days=${days}`);
  return response.json();
}

export async function getTopActiveUsers(limit: number = 10) {
  const response = await apiRequest("GET", `/api/analytics/top-users?limit=${limit}`);
  return response.json();
}

export async function getPeakHours() {
  const response = await apiRequest("GET", "/api/analytics/peak-hours");
  return response.json();
}

export async function getRoleDistribution() {
  const response = await apiRequest("GET", "/api/analytics/role-distribution");
  return response.json();
}

export type MonitorRequestState = "ok" | "unauthorized" | "forbidden" | "network_error";

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
  bottleneckType: string;
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

async function fetchMonitorEndpoint<T>(endpoint: string): Promise<MonitorApiResult<T>> {
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        ...getAuthHeader(),
      },
      credentials: "include",
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

async function postMonitorEndpoint<T>(endpoint: string, body: unknown): Promise<MonitorApiResult<T>> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      credentials: "include",
      body: JSON.stringify(body ?? {}),
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

export async function getSystemHealth() {
  return fetchMonitorEndpoint<SystemHealthPayload>("/internal/system-health");
}

export async function getSystemMode() {
  return fetchMonitorEndpoint<SystemModePayload>("/internal/system-mode");
}

export async function getWorkers() {
  return fetchMonitorEndpoint<WorkersPayload>("/internal/workers");
}

export async function getAlerts() {
  return fetchMonitorEndpoint<AlertsPayload>("/internal/alerts");
}

export async function getIntelligenceExplain() {
  return fetchMonitorEndpoint<IntelligenceExplainPayload>("/internal/intelligence/explain");
}

export async function injectChaos(payload: ChaosInjectPayload) {
  return postMonitorEndpoint<ChaosInjectResponse>("/internal/chaos/inject", payload);
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
    } catch (e) {
      // Fall through to simple hash
    }
  }

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}
