import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerSystemRoutes } from "../system.routes";
import type { StartupHealthSnapshot } from "../../internal/startup-health";
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

function createSystemRouteHarness(options?: {
  dbOk?: boolean;
  startup?: Partial<StartupHealthSnapshot>;
}) {
  const app = createJsonTestApp();
  registerSystemRoutes(app, {
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
    computeInternalMonitorSnapshot: () => ({
      updatedAt: "2026-03-24T00:00:00.000Z",
    } as any),
    buildInternalMonitorAlerts: () => [],
    getControlState: () => ({
      mode: "NORMAL",
      throttleFactor: 1,
      rejectHeavyRoutes: false,
      preAllocateMB: 0,
      workerCount: 1,
      maxWorkers: 1,
      workers: [],
      circuits: {},
      predictor: null,
      queueLength: 0,
      updatedAt: "2026-03-24T00:00:00.000Z",
    } as any),
    getDbProtection: () => false,
    getRequestRate: () => 0,
    getLatencyP95: () => 0,
    getLocalCircuitSnapshots: () => ({
      ai: {} as any,
      db: {} as any,
      export: {} as any,
    }),
    getIntelligenceExplainability: () => ({
      anomalyBreakdown: [],
      correlationMatrix: [],
      slopeValues: [],
      forecastProjection: [],
      governanceState: {},
      chosenStrategy: null,
      decisionReason: "n/a",
    } as any),
    injectChaos: () => ({
      injected: {} as any,
      active: [],
    }),
    createAuditLog: async (data) => ({
      id: "audit-1",
      ...data,
    } as any),
    checkDbConnectivity: async () => options?.dbOk ?? true,
    getStartupHealthSnapshot: () => createStartupSnapshot(options?.startup),
  });

  return { app };
}

function createMonitorSnapshot(overrides: Record<string, unknown> = {}) {
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
  registerSystemRoutes(app, {
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
    computeInternalMonitorSnapshot: () =>
      createMonitorSnapshot({
        rollupRefreshPendingCount: 12,
        rollupRefreshRunningCount: 2,
        rollupRefreshRetryCount: 1,
        rollupRefreshOldestPendingAgeMs: 91_000,
      }) as any,
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
    getControlState: () => ({
      mode: "NORMAL",
      throttleFactor: 1,
      rejectHeavyRoutes: false,
      preAllocateMB: 0,
      workerCount: 1,
      maxWorkers: 1,
      workers: [],
      circuits: {},
      predictor: null,
      queueLength: 0,
      updatedAt: Date.parse("2026-03-24T00:00:00.000Z"),
    } as any),
    getDbProtection: () => false,
    getRequestRate: () => 0,
    getLatencyP95: () => 0,
    getLocalCircuitSnapshots: () => ({
      ai: {} as any,
      db: {} as any,
      export: {} as any,
    }),
    getIntelligenceExplainability: () => ({
      anomalyBreakdown: [],
      correlationMatrix: [],
      slopeValues: [],
      forecastProjection: [],
      governanceState: {},
      chosenStrategy: null,
      decisionReason: "n/a",
    } as any),
    injectChaos: () => ({
      injected: {} as any,
      active: [],
    }),
    createAuditLog: async (data) => ({
      id: "audit-1",
      ...data,
    } as any),
    checkDbConnectivity: async () => true,
    getStartupHealthSnapshot: () => createStartupSnapshot(),
  });
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
