import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerSystemRoutes } from "../system.routes";
import type {
  ChaosInjectionResult,
  LocalCircuitSnapshots,
  SystemRouteDeps,
} from "../system.routes";
import type { CircuitSnapshot } from "../../internal/circuitBreaker";
import type {
  InternalMonitorSnapshot,
  WorkerControlState,
} from "../../internal/runtime-monitor-manager";
import type { StartupHealthSnapshot } from "../../internal/startup-health";
import type { ExplainabilityReport } from "../../intelligence/types";
import type { ChaosEvent } from "../../intelligence/chaos/ChaosEngine";
import type { AuditLog, InsertAuditLog } from "../../../shared/schema-postgres";
import type { WebVitalOverviewPayload } from "../../../shared/web-vitals";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

function createStartupSnapshot(overrides: Partial<StartupHealthSnapshot> = {}): StartupHealthSnapshot {
  return {
    failed: false,
    failureDetails: null,
    failureReason: null,
    ready: true,
    stage: "ready",
    startedAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:01.000Z",
    validation: {
      warningCount: 0,
      warnings: [],
    },
    ...overrides,
  };
}

function allowAll(): RequestHandler {
  return (_req, _res, next) => next();
}

function createCircuitSnapshot(
  name: string,
  overrides: Partial<CircuitSnapshot> = {},
): CircuitSnapshot {
  return {
    name,
    state: "CLOSED",
    failures: 0,
    successes: 0,
    rejections: 0,
    totalRequests: 0,
    failureRate: 0,
    nextRetryAt: null,
    cooldownMs: 20_000,
    threshold: 0.5,
    ...overrides,
  };
}

function createLocalCircuitSnapshots(
  overrides: Partial<LocalCircuitSnapshots> = {},
): LocalCircuitSnapshots {
  return {
    ai: createCircuitSnapshot("ai"),
    db: createCircuitSnapshot("db"),
    export: createCircuitSnapshot("export"),
    ...overrides,
  };
}

function createControlState(
  overrides: Partial<WorkerControlState> = {},
): WorkerControlState {
  return {
    mode: "NORMAL",
    healthScore: 94,
    dbProtection: false,
    rejectHeavyRoutes: false,
    throttleFactor: 1,
    predictor: {
      requestRateMA: 0,
      latencyMA: 0,
      cpuMA: 0,
      requestRateTrend: 0,
      latencyTrend: 0,
      cpuTrend: 0,
      sustainedUpward: false,
      lastUpdatedAt: null,
    },
    workerCount: 1,
    maxWorkers: 1,
    queueLength: 0,
    preAllocateMB: 0,
    updatedAt: Date.parse("2026-03-24T00:00:00.000Z"),
    workers: [],
    circuits: {
      aiOpenWorkers: 0,
      dbOpenWorkers: 0,
      exportOpenWorkers: 0,
    },
    ...overrides,
  };
}

function createExplainabilityReport(
  overrides: Partial<ExplainabilityReport> = {},
): ExplainabilityReport {
  return {
    anomalyBreakdown: {
      normalizedZScore: 0,
      slopeWeight: 0,
      percentileShift: 0,
      correlationWeight: 0,
      forecastRisk: 0,
      mutationFactor: 0,
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
      confidenceScore: 1,
      reason: "n/a",
    },
    decisionReason: "n/a",
    ...overrides,
  };
}

function createChaosEvent(
  overrides: Partial<ChaosEvent> = {},
): ChaosEvent {
  return {
    id: "chaos-1",
    type: "cpu_spike",
    magnitude: 25,
    createdAt: Date.parse("2026-03-24T00:00:00.000Z"),
    expiresAt: Date.parse("2026-03-24T00:00:20.000Z"),
    ...overrides,
  };
}

function createChaosInjectionResult(
  overrides: Partial<ChaosInjectionResult> = {},
): ChaosInjectionResult {
  return {
    injected: createChaosEvent(),
    active: [],
    ...overrides,
  };
}

function createAuditLogRow(data: InsertAuditLog): AuditLog {
  return {
    id: "audit-1",
    action: data.action,
    performedBy: data.performedBy,
    requestId: data.requestId ?? null,
    targetUser: data.targetUser ?? null,
    targetResource: data.targetResource ?? null,
    details: data.details ?? null,
    timestamp: new Date("2026-03-24T00:00:00.000Z"),
  };
}

function createRollupQueueSnapshot(overrides?: Partial<{
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
}>) {
  return {
    pendingCount: 0,
    runningCount: 0,
    retryCount: 0,
    oldestPendingAgeMs: 0,
    ...overrides,
  };
}

function createWebVitalsOverview(
  overrides: Partial<WebVitalOverviewPayload> = {},
): WebVitalOverviewPayload {
  return {
    windowMinutes: 15,
    totalSamples: 0,
    pageSummaries: [
      {
        pageType: "public",
        sampleCount: 0,
        latestCapturedAt: null,
        metrics: [],
      },
      {
        pageType: "authenticated",
        sampleCount: 0,
        latestCapturedAt: null,
        metrics: [],
      },
    ],
    updatedAt: "2026-03-24T00:00:00.000Z",
    ...overrides,
  };
}

function createSystemRouteExtraDeps() {
  return {
    getCollectionRollupQueueStatus: async () => createRollupQueueSnapshot(),
    drainCollectionRollupQueue: async () => ({
      ok: true,
      action: "drain",
      message: "Drain requested.",
      snapshot: createRollupQueueSnapshot(),
    }),
    retryCollectionRollupFailures: async () => ({
      ok: true,
      action: "retry-failures",
      message: "Retry requested.",
      snapshot: createRollupQueueSnapshot(),
    }),
    autoHealCollectionRollupQueue: async () => ({
      ok: true,
      action: "auto-heal",
      message: "Auto-heal requested.",
      snapshot: createRollupQueueSnapshot(),
    }),
    rebuildCollectionRollups: async () => ({
      ok: true,
      action: "rebuild",
      message: "Rebuild requested.",
      snapshot: createRollupQueueSnapshot(),
    }),
    listMonitorAlertHistory: async () => ({
      incidents: [],
      pagination: {
        page: 1,
        pageSize: 5,
        totalItems: 0,
        totalPages: 1,
      },
    }),
    deleteMonitorAlertHistoryOlderThan: async () => 0,
    getWebVitalsOverview: () => createWebVitalsOverview(),
  };
}

function createMonitorSnapshot(
  overrides: Partial<InternalMonitorSnapshot> = {},
): InternalMonitorSnapshot {
  return {
    score: 94,
    mode: "NORMAL",
    cpuPercent: 12,
    ramPercent: 38,
    p95LatencyMs: 42,
    errorRate: 0,
    dbLatencyMs: 18,
    aiLatencyMs: 0,
    eventLoopLagMs: 4,
    requestRate: 3,
    activeRequests: 1,
    queueLength: 0,
    workerCount: 1,
    maxWorkers: 1,
    dbProtection: false,
    slowQueryCount: 0,
    dbConnections: 2,
    aiFailRate: 0,
    status401Count: 0,
    status403Count: 0,
    status429Count: 0,
    localOpenCircuitCount: 0,
    clusterOpenCircuitCount: 0,
    bottleneckType: "NONE",
    rollupRefreshPendingCount: 0,
    rollupRefreshRunningCount: 0,
    rollupRefreshRetryCount: 0,
    rollupRefreshOldestPendingAgeMs: 0,
    updatedAt: Date.parse("2026-03-24T00:00:00.000Z"),
    ...overrides,
  };
}

function createBaseSystemRouteDeps(
  overrides: Partial<SystemRouteDeps> = {},
): SystemRouteDeps {
  return {
    authenticateToken: createTestAuthenticateToken({
      userId: "monitor-1",
      username: "monitor.user",
      role: "admin",
    }),
    requireRole: createTestRequireRole(),
    requireMonitorAccess: allowAll(),
    getMaintenanceStateCached: async () => ({
      maintenance: false,
      message: "",
      type: "soft",
      startTime: null,
      endTime: null,
    }),
    computeInternalMonitorSnapshot: () => createMonitorSnapshot(),
    buildInternalMonitorAlerts: () => [],
    getControlState: () => createControlState(),
    getDbProtection: () => false,
    getRequestRate: () => 0,
    getLatencyP95: () => 0,
    getLocalCircuitSnapshots: () => createLocalCircuitSnapshots(),
    getIntelligenceExplainability: () => createExplainabilityReport(),
    injectChaos: () => createChaosInjectionResult(),
    ...createSystemRouteExtraDeps(),
    createAuditLog: async (data) => createAuditLogRow(data),
    checkDbConnectivity: async () => true,
    getStartupHealthSnapshot: () => createStartupSnapshot(),
    ...overrides,
  };
}

function createSystemRouteHarness(options?: {
  dbOk?: boolean;
  startup?: Partial<StartupHealthSnapshot>;
}) {
  const app = createJsonTestApp();
  registerSystemRoutes(app, createBaseSystemRouteDeps({
    checkDbConnectivity: async () => options?.dbOk ?? true,
    getStartupHealthSnapshot: () => createStartupSnapshot(options?.startup),
  }));

  return { app };
}

test("GET /api/health/live reports a live process with startup validation metadata", async () => {
  const { app } = createSystemRouteHarness({
    startup: {
      ready: false,
      stage: "booting",
      validation: {
        warningCount: 1,
        warnings: [
          {
            code: "PUBLIC_APP_URL_MISSING",
            envNames: ["PUBLIC_APP_URL"],
            message: "PUBLIC_APP_URL is not set.",
            severity: "warning",
          },
        ],
      },
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/health/live`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.status, "ok");
    assert.equal(payload.live, true);
    assert.equal(payload.startup.stage, "booting");
    assert.equal(payload.validation.warningCount, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/health/ready returns 200 only when startup and database checks are both ready", async () => {
  const { app } = createSystemRouteHarness({
    dbOk: true,
    startup: {
      ready: true,
      stage: "ready",
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.status, "ok");
    assert.equal(payload.ready, true);
    assert.equal(payload.checks.startup, "ready");
    assert.equal(payload.checks.database, "connected");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/health/ready returns 503 while startup is still in progress", async () => {
  const { app } = createSystemRouteHarness({
    dbOk: true,
    startup: {
      ready: false,
      stage: "initializing-storage",
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    assert.equal(response.status, 503);

    const payload = await response.json();
    assert.equal(payload.status, "starting");
    assert.equal(payload.ready, false);
    assert.equal(payload.checks.startup, "starting");
    assert.equal(payload.checks.database, "connected");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/health preserves the aggregate health contract while exposing live readiness details", async () => {
  const { app } = createSystemRouteHarness({
    dbOk: false,
    startup: {
      ready: true,
      stage: "ready",
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 503);

    const payload = await response.json();
    assert.equal(payload.status, "degraded");
    assert.equal(payload.mode, "postgresql");
    assert.equal(payload.database, "unreachable");
    assert.equal(payload.ready, false);
    assert.equal(payload.live.live, true);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /internal/system-health exposes rollup refresh queue metrics alongside alert count", async () => {
  const app = createJsonTestApp();
  registerSystemRoutes(app, createBaseSystemRouteDeps({
    computeInternalMonitorSnapshot: () =>
      createMonitorSnapshot({
        rollupRefreshPendingCount: 12,
        rollupRefreshRunningCount: 2,
        rollupRefreshRetryCount: 1,
        rollupRefreshOldestPendingAgeMs: 91_000,
      }),
    buildInternalMonitorAlerts: () => [
      {
        id: "rollup_queue_warning",
        severity: "WARNING",
        message: "Collection rollup refresh backlog is growing.",
        timestamp: "2026-03-24T00:00:00.000Z",
        source: "ROLLUP_QUEUE",
      },
      {
        id: "rollup_lag_warning",
        severity: "WARNING",
        message: "Collection rollup refresh lag is elevated.",
        timestamp: "2026-03-24T00:00:00.000Z",
        source: "ROLLUP_LAG",
      },
    ],
  }));
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/internal/system-health`, {
      headers: {
        "x-test-username": "monitor.user",
        "x-test-role": "admin",
        "x-test-userid": "monitor-1",
      },
    });
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.rollupRefreshPendingCount, 12);
    assert.equal(payload.rollupRefreshRunningCount, 2);
    assert.equal(payload.rollupRefreshRetryCount, 1);
    assert.equal(payload.rollupRefreshOldestPendingAgeMs, 91_000);
    assert.equal(payload.activeAlertCount, 2);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /internal/alerts returns paginated live monitor alerts", async () => {
  const app = createJsonTestApp();
  registerSystemRoutes(app, createBaseSystemRouteDeps({
    buildInternalMonitorAlerts: () => [
      {
        id: "alert-1",
        severity: "CRITICAL",
        message: "CPU saturation detected.",
        timestamp: "2026-03-24T00:00:00.000Z",
        source: "CPU",
      },
      {
        id: "alert-2",
        severity: "WARNING",
        message: "DB latency elevated.",
        timestamp: "2026-03-24T00:01:00.000Z",
        source: "DB",
      },
      {
        id: "alert-3",
        severity: "INFO",
        message: "AI queue is warming.",
        timestamp: "2026-03-24T00:02:00.000Z",
        source: "AI",
      },
    ],
  }));
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/internal/alerts?page=2&pageSize=2`, {
      headers: {
        "x-test-username": "monitor.user",
        "x-test-role": "admin",
        "x-test-userid": "monitor-1",
      },
    });
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(Array.isArray(payload.alerts), true);
    assert.equal(payload.alerts.length, 1);
    assert.equal(payload.alerts[0]?.id, "alert-3");
    assert.deepEqual(payload.pagination, {
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
  } finally {
    await stopTestServer(server);
  }
});

test("GET /internal/alerts/history returns recent monitor alert incidents", async () => {
  const app = createJsonTestApp();
  const listCalls: Array<{ page?: number; pageSize?: number }> = [];
  registerSystemRoutes(app, createBaseSystemRouteDeps({
    listMonitorAlertHistory: async (options) => {
      listCalls.push(options || {});
      return {
        incidents: [
          {
            id: "incident-1",
            alertKey: "rollup_queue_warning",
            severity: "WARNING",
            source: "ROLLUP_QUEUE",
            message: "Collection rollup refresh backlog is growing.",
            status: "open",
            firstSeenAt: new Date("2026-03-24T00:00:00.000Z"),
            lastSeenAt: new Date("2026-03-24T00:05:00.000Z"),
            resolvedAt: null,
            updatedAt: new Date("2026-03-24T00:05:00.000Z"),
          },
        ],
        pagination: {
          page: options?.page ?? 1,
          pageSize: options?.pageSize ?? 5,
          totalItems: 11,
          totalPages: 3,
        },
      };
    },
  }));
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/internal/alerts/history?page=2&pageSize=5`, {
      headers: {
        "x-test-username": "monitor.user",
        "x-test-role": "admin",
        "x-test-userid": "monitor-1",
      },
    });
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(Array.isArray(payload.incidents), true);
    assert.equal(payload.incidents.length, 1);
    assert.equal(payload.incidents[0]?.alertKey, "rollup_queue_warning");
    assert.deepEqual(payload.pagination, {
      page: 2,
      pageSize: 5,
      totalItems: 11,
      totalPages: 3,
    });
    assert.deepEqual(listCalls, [{ page: 2, pageSize: 5 }]);
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /internal/alerts/history removes resolved incidents older than the selected age", async () => {
  const app = createJsonTestApp();
  const cleanupCalls: Date[] = [];
  const auditLogs: Array<{ action: string; details: string }> = [];

  registerSystemRoutes(app, createBaseSystemRouteDeps({
    authenticateToken: createTestAuthenticateToken({
      userId: "monitor-1",
      username: "monitor.superuser",
      role: "superuser",
    }),
    deleteMonitorAlertHistoryOlderThan: async (cutoffDate) => {
      cleanupCalls.push(cutoffDate);
      return 7;
    },
    createAuditLog: async (data) => {
      auditLogs.push({
        action: data.action,
        details: data.details || "",
      });
      return createAuditLogRow(data);
    },
  }));
  const { server, baseUrl } = await startTestServer(app);

  try {
    const before = Date.now();
    const response = await fetch(`${baseUrl}/internal/alerts/history`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        "x-test-username": "monitor.superuser",
        "x-test-role": "superuser",
        "x-test-userid": "monitor-1",
      },
      body: JSON.stringify({
        olderThanDays: 45,
      }),
    });
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.deletedCount, 7);
    assert.equal(payload.olderThanDays, 45);
    assert.equal(cleanupCalls.length, 1);

    const ageHours = (before - cleanupCalls[0].getTime()) / (1000 * 60 * 60);
    assert.equal(ageHours > 45 * 24 - 2, true);
    assert.equal(ageHours < 45 * 24 + 2, true);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0]?.action, "MONITOR_ALERT_HISTORY_CLEANUP");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /internal/web-vitals returns the recent real-user experience overview", async () => {
  const app = createJsonTestApp();
  registerSystemRoutes(app, createBaseSystemRouteDeps({
    getWebVitalsOverview: () => createWebVitalsOverview({
      totalSamples: 8,
      pageSummaries: [
        {
          pageType: "public",
          sampleCount: 5,
          latestCapturedAt: "2026-03-24T00:05:00.000Z",
          metrics: [
            {
              name: "LCP",
              sampleCount: 5,
              p75: 2400,
              p75Rating: "good",
              latestValue: 2100,
              latestRating: "good",
              latestCapturedAt: "2026-03-24T00:05:00.000Z",
              latestPath: "/",
            },
          ],
        },
        {
          pageType: "authenticated",
          sampleCount: 3,
          latestCapturedAt: "2026-03-24T00:06:00.000Z",
          metrics: [
            {
              name: "INP",
              sampleCount: 3,
              p75: 180,
              p75Rating: "good",
              latestValue: 160,
              latestRating: "good",
              latestCapturedAt: "2026-03-24T00:06:00.000Z",
              latestPath: "/monitor",
            },
          ],
        },
      ],
      updatedAt: "2026-03-24T00:06:00.000Z",
    }),
  }));
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/internal/web-vitals`, {
      headers: {
        "x-test-username": "monitor.user",
        "x-test-role": "admin",
        "x-test-userid": "monitor-1",
      },
    });
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.totalSamples, 8);
    assert.equal(payload.pageSummaries[0]?.pageType, "public");
    assert.equal(payload.pageSummaries[0]?.metrics[0]?.name, "LCP");
    assert.equal(payload.pageSummaries[0]?.metrics[0]?.p75, 2400);
  } finally {
    await stopTestServer(server);
  }
});

test("rollup refresh control routes remain superuser-only and return snapshots", async () => {
  const app = createJsonTestApp();
  registerSystemRoutes(app, createBaseSystemRouteDeps({
    authenticateToken: createTestAuthenticateToken({
      userId: "superuser-1",
      username: "superuser.user",
      role: "superuser",
    }),
    getCollectionRollupQueueStatus: async () => createRollupQueueSnapshot({
      pendingCount: 3,
      runningCount: 1,
      retryCount: 1,
      oldestPendingAgeMs: 12_000,
    }),
    drainCollectionRollupQueue: async () => ({
      ok: true,
      action: "drain",
      message: "Drain requested.",
      snapshot: createRollupQueueSnapshot({
        pendingCount: 3,
        runningCount: 1,
        retryCount: 1,
        oldestPendingAgeMs: 12_000,
      }),
    }),
    retryCollectionRollupFailures: async () => ({
      ok: true,
      action: "retry-failures",
      message: "Retry requested.",
      snapshot: createRollupQueueSnapshot({
        pendingCount: 2,
        runningCount: 1,
        retryCount: 0,
        oldestPendingAgeMs: 9_000,
      }),
    }),
    autoHealCollectionRollupQueue: async () => ({
      ok: true,
      action: "auto-heal",
      message: "Auto-heal requested.",
      snapshot: createRollupQueueSnapshot({
        pendingCount: 1,
        runningCount: 0,
        retryCount: 0,
        oldestPendingAgeMs: 1_000,
      }),
    }),
    rebuildCollectionRollups: async () => ({
      ok: true,
      action: "rebuild",
      message: "Rebuild requested.",
      snapshot: createRollupQueueSnapshot(),
    }),
  }));
  const { server, baseUrl } = await startTestServer(app);

  try {
    const forbiddenResponse = await fetch(`${baseUrl}/internal/rollup-refresh/drain`, {
      method: "POST",
      headers: {
        "x-test-username": "admin.user",
        "x-test-role": "admin",
        "x-test-userid": "admin-1",
      },
    });
    assert.equal(forbiddenResponse.status, 403);

    const statusResponse = await fetch(`${baseUrl}/internal/rollup-refresh/status`, {
      method: "POST",
      headers: {
        "x-test-username": "superuser.user",
        "x-test-role": "superuser",
        "x-test-userid": "superuser-1",
      },
    });
    assert.equal(statusResponse.status, 200);
    const statusPayload = await statusResponse.json();
    assert.equal(statusPayload.snapshot.pendingCount, 3);

    const rebuildResponse = await fetch(`${baseUrl}/internal/rollup-refresh/rebuild`, {
      method: "POST",
      headers: {
        "x-test-username": "superuser.user",
        "x-test-role": "superuser",
        "x-test-userid": "superuser-1",
      },
    });
    assert.equal(rebuildResponse.status, 200);
    const rebuildPayload = await rebuildResponse.json();
    assert.equal(rebuildPayload.action, "rebuild");
    assert.equal(rebuildPayload.snapshot.pendingCount, 0);
  } finally {
    await stopTestServer(server);
  }
});
