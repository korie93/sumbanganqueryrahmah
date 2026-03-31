import assert from "node:assert/strict";
import test from "node:test";
import type { Express, RequestHandler } from "express";
import { registerActivityRoutes } from "../activity.routes";
import { registerAiRoutes } from "../ai.routes";
import { registerCollectionAdminRoutes } from "../collection/collection-admin-routes";
import { registerAuthAdminRoutes } from "../auth/auth-admin-routes";
import { registerImportRoutes } from "../imports.routes";
import { registerOperationsRoutes } from "../operations.routes";
import { registerSearchRoutes } from "../search.routes";
import { registerSettingsRoutes } from "../settings.routes";
import { registerSystemRoutes } from "../system.routes";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  createTestRequireTabAccess,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type TestRole = "user" | "admin" | "superuser";
type RoleExpectationMatrix = {
  anonymous: number;
  user: number;
  admin: number;
  superuser: number;
};

type MatrixRequestConfig = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
};

function buildHeaders(role?: TestRole, extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    ...extraHeaders,
  };

  if (role) {
    headers["x-test-username"] = `${role}.matrix`;
    headers["x-test-role"] = role;
    headers["x-test-userid"] = `${role}-1`;
  }

  return headers;
}

async function sendMatrixRequest(
  baseUrl: string,
  request: MatrixRequestConfig,
  role?: TestRole,
  extraHeaders?: Record<string, string>,
) {
  const headers = buildHeaders(role, extraHeaders);
  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(request.body);
  }

  return fetch(`${baseUrl}${request.path}`, init);
}

async function assertRoleMatrix(
  baseUrl: string,
  request: MatrixRequestConfig,
  expected: RoleExpectationMatrix,
) {
  const anonymousResponse = await sendMatrixRequest(baseUrl, request);
  assert.equal(
    anonymousResponse.status,
    expected.anonymous,
    `${request.method} ${request.path} should return ${expected.anonymous} for anonymous requests`,
  );

  for (const role of ["user", "admin", "superuser"] as const) {
    const response = await sendMatrixRequest(baseUrl, request, role);
    assert.equal(
      response.status,
      expected[role],
      `${request.method} ${request.path} should return ${expected[role]} for role '${role}'`,
    );
  }
}

function createSettingsPermissionHarness() {
  const calls = {
    listSettings: 0,
    updateSetting: 0,
  };
  const app = createJsonTestApp();

  registerSettingsRoutes(app, {
    storage: {
      getAppConfig: async () => ({
        systemName: "SQR",
        sessionTimeoutMinutes: 30,
        heartbeatIntervalMinutes: 1,
        wsIdleMinutes: 3,
        aiEnabled: true,
        semanticSearchEnabled: true,
        aiTimeoutMs: 6000,
        searchResultLimit: 200,
        viewerRowsPerPage: 100,
      }),
      getRoleTabVisibility: async () => ({
        settings: true,
        dashboard: true,
      }),
      getSettingsForRole: async () => {
        calls.listSettings += 1;
        return [
          {
            id: "general",
            name: "General",
            description: null,
            settings: [],
          },
        ];
      },
      updateSystemSetting: async () => {
        calls.updateSetting += 1;
        return {
          status: "updated",
          message: "Updated.",
          setting: {
            key: "system_name",
            label: "System Name",
            description: null,
            type: "text",
            value: "SQR",
            defaultValue: "SQR",
            isCritical: false,
            updatedAt: new Date("2026-03-25T00:00:00.000Z"),
            permission: {
              canView: true,
              canEdit: true,
            },
            options: [],
          },
          shouldBroadcast: false,
        };
      },
      createAuditLog: async () => ({ id: "audit-1" }),
    } as any,
    authenticateToken: createTestAuthenticateToken(),
    requireRole: createTestRequireRole(),
    requireTabAccess: createTestRequireTabAccess(),
    clearTabVisibilityCache: () => {},
    invalidateRuntimeSettingsCache: () => {},
    invalidateMaintenanceCache: () => {},
    getMaintenanceStateCached: async () => ({
      maintenance: false,
      message: "",
      type: "soft" as const,
      startTime: null,
      endTime: null,
    }),
    broadcastWsMessage: () => {},
  });

  return {
    app,
    calls,
  };
}

function createOperationsPermissionHarness() {
  const calls = {
    summary: 0,
    backups: 0,
    auditLogs: 0,
    debugSockets: 0,
  };
  const app = createJsonTestApp();
  const controller = {
    getDashboardSummary: async (_req: any, res: any) => {
      calls.summary += 1;
      return res.json({ ok: true, summary: {} });
    },
    listBackups: async (_req: any, res: any) => {
      calls.backups += 1;
      return res.json({ ok: true, backups: [] });
    },
    listAuditLogs: async (_req: any, res: any) => {
      calls.auditLogs += 1;
      return res.json({ ok: true, logs: [] });
    },
    getWebsocketClients: async (_req: any, res: any) => {
      calls.debugSockets += 1;
      return res.json({ ok: true, clients: [] });
    },
  };

  registerOperationsRoutes(app, {
    operationsController: controller as any,
    authenticateToken: createTestAuthenticateToken(),
    requireRole: createTestRequireRole(),
    requireTabAccess: createTestRequireTabAccess(),
  });

  return {
    app,
    calls,
  };
}

function createAuthAdminPermissionHarness() {
  const calls = {
    listManagedUsers: 0,
    createManagedUser: 0,
    getAccounts: 0,
  };
  const app = createJsonTestApp();
  const authenticateToken = createTestAuthenticateToken();
  const requireRole = createTestRequireRole();
  const passThroughRateLimiter: RequestHandler = (_req, _res, next) => next();

  registerAuthAdminRoutes({
    app,
    authAccountService: {
      getManagedUsers: async () => {
        calls.listManagedUsers += 1;
        return {
          users: [],
          pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
        };
      },
      createManagedUser: async () => {
        calls.createManagedUser += 1;
        return {
          user: {
            id: "managed-1",
            username: "managed.user",
            fullName: "Managed User",
            email: "managed@example.com",
            role: "user",
            status: "pending",
            mustChangePassword: false,
            passwordResetBySuperuser: false,
            isBanned: false,
            activatedAt: null,
            passwordChangedAt: null,
            lastLoginAt: null,
          },
          activation: {
            deliveryMode: "preview",
            errorCode: null,
            errorMessage: null,
            expiresAt: new Date("2026-03-26T00:00:00.000Z"),
            previewUrl: "/dev/mail-preview/example",
            recipientEmail: "managed@example.com",
            sent: true,
          },
        };
      },
      getAccounts: async () => {
        calls.getAccounts += 1;
        return [];
      },
    } as any,
    authenticateToken,
    requireRole,
    rateLimiters: {
      adminAction: passThroughRateLimiter,
    } as any,
    jsonRoute: (handler: (req: unknown, res: unknown) => Promise<unknown>) => async (req: unknown, res: any) => {
      const payload = await handler(req, res);
      if (!res.headersSent && payload !== undefined) {
        res.json(payload);
      }
    },
    closeActivitySockets: () => {},
    buildUserPayload: (user: any) => user,
    buildManagedUserPayload: (user: any) => user,
    buildDeliveryPayload: (payload: any) => payload,
    buildOkPayload: (payload: Record<string, unknown>) => ({
      ok: true,
      ...payload,
    }),
  } as any);

  return {
    app,
    calls,
  };
}

function createCollectionAdminPermissionHarness() {
  const calls = {
    listAdmins: 0,
    createAdminGroup: 0,
    saveAssignments: 0,
  };
  const app = createJsonTestApp();
  const authenticateToken = createTestAuthenticateToken();
  const requireRole = createTestRequireRole();
  const requireTabAccess = createTestRequireTabAccess();

  registerCollectionAdminRoutes({
    app,
    collectionService: {
      listAdmins: async () => {
        calls.listAdmins += 1;
        return [];
      },
      createAdminGroup: async () => {
        calls.createAdminGroup += 1;
        return { ok: true };
      },
      setNicknameAssignments: async () => {
        calls.saveAssignments += 1;
        return { ok: true };
      },
    } as any,
    superuserReportAccess: [
      authenticateToken,
      requireRole("superuser"),
      requireTabAccess("collection-report"),
    ],
    jsonRoute: (
      _fallbackMessage: string,
      handler: (req: unknown) => Promise<unknown>,
    ) => async (req: unknown, res: any) => {
      res.json(await handler(req));
    },
  } as any);

  return {
    app,
    calls,
  };
}

function createActivityPermissionHarness() {
  const calls = {
    listActivities: 0,
    deleteActivity: 0,
    banActivity: 0,
    listBannedUsers: 0,
  };
  const app = createJsonTestApp();
  const connectedClients = new Map();
  const passThroughRateLimiter: RequestHandler = (_req, _res, next) => next();

  registerActivityRoutes(app, {
    storage: {
      getAllActivities: async () => {
        calls.listActivities += 1;
        return [];
      },
      getFilteredActivities: async () => [],
      getActivityById: async (id: string) => ({
        id,
        username: "regular.user",
        role: "user",
        isActive: true,
        fingerprint: "fp-1",
        ipAddress: "127.0.0.1",
        browser: "Chrome",
        pcName: "PC-1",
      }),
      deleteActivity: async () => {
        calls.deleteActivity += 1;
        return true;
      },
      clearCollectionNicknameSessionByActivity: async () => {},
      updateActivity: async () => ({
        id: "activity-1",
      }),
      createAuditLog: async () => ({ id: "audit-1" }),
      getUserByUsername: async () => ({
        id: "user-1",
        username: "regular.user",
        role: "user",
      }),
      banVisitor: async () => {
        calls.banActivity += 1;
        return { banId: "ban-1" };
      },
      getBannedSessions: async () => {
        calls.listBannedUsers += 1;
        return [
          {
            banId: "ban-1",
            username: "regular.user",
            role: "user",
            ipAddress: "127.0.0.1",
            browser: "Chrome",
            bannedAt: new Date("2026-03-25T00:00:00.000Z"),
          },
        ];
      },
      getActiveActivities: async () => [],
      getActiveActivitiesByUsername: async () => [],
      deactivateUserActivities: async () => {},
      updateUserBan: async () => {},
      unbanVisitor: async () => {},
    } as any,
    authenticateToken: createTestAuthenticateToken(),
    requireRole: createTestRequireRole(),
    requireTabAccess: createTestRequireTabAccess(),
    connectedClients: connectedClients as any,
    rateLimiters: {
      adminAction: passThroughRateLimiter,
    },
  });

  return {
    app,
    calls,
  };
}

function createImportsPermissionHarness() {
  const calls = {
    createImport: 0,
    analyzeImport: 0,
    analyzeAll: 0,
    deleteImport: 0,
  };
  const app = createJsonTestApp();

  registerImportRoutes(app, {
    importsController: {
      listDataRows: async (_req: any, res: any) => res.json({ rows: [], total: 0 }),
      listImports: async (_req: any, res: any) => res.json({ imports: [] }),
      createImport: async (_req: any, res: any) => {
        calls.createImport += 1;
        return res.json({ id: "import-1" });
      },
      getImport: async (_req: any, res: any) => res.json({ import: null, rows: [] }),
      getImportDataPage: async (_req: any, res: any) => res.json({ rows: [], total: 0, page: 1, limit: 50 }),
      analyzeImport: async (_req: any, res: any) => {
        calls.analyzeImport += 1;
        return res.json({ import: { id: "import-1" }, totalRows: 0, analysis: {} });
      },
      analyzeAll: async (_req: any, res: any) => {
        calls.analyzeAll += 1;
        return res.json({ totalImports: 0, totalRows: 0, imports: [], analysis: {} });
      },
      renameImport: async (_req: any, res: any) => res.json({ id: "import-1", name: "Updated" }),
      deleteImport: async (_req: any, res: any) => {
        calls.deleteImport += 1;
        return res.json({ success: true });
      },
    } as any,
    authenticateToken: createTestAuthenticateToken(),
    requireRole: createTestRequireRole(),
    requireTabAccess: createTestRequireTabAccess(),
    searchRateLimiter: (_req, _res, next) => next(),
  });

  return {
    app,
    calls,
  };
}

function createAiPermissionHarness() {
  const calls = {
    config: 0,
    search: 0,
    indexImport: 0,
    chat: 0,
  };
  const app = createJsonTestApp();

  registerAiRoutes(app, {
    aiController: {
      getConfig: async (_req: any, res: any) => {
        calls.config += 1;
        return res.json({ aiEnabled: true });
      },
      search: async (_req: any, res: any) => {
        calls.search += 1;
        return res.status(200).json({ ok: true });
      },
      indexImport: async (_req: any, res: any) => {
        calls.indexImport += 1;
        return res.status(200).json({ ok: true });
      },
      importBranches: async (_req: any, res: any) => res.status(200).json({ ok: true }),
      chat: async (_req: any, res: any) => {
        calls.chat += 1;
        return res.status(200).json({ ok: true });
      },
    } as any,
    authenticateToken: createTestAuthenticateToken(),
    requireRole: createTestRequireRole(),
    withAiConcurrencyGate: (_route, handler) => (req, res, next) => {
      void Promise.resolve(handler(req as any, res as any)).catch(next);
    },
  });

  return {
    app,
    calls,
  };
}

function createSearchPermissionHarness() {
  const calls = {
    columns: 0,
    global: 0,
    simple: 0,
    advanced: 0,
  };
  const app = createJsonTestApp();

  registerSearchRoutes(app, {
    searchController: {
      getColumns: async (_req: any, res: any) => {
        calls.columns += 1;
        return res.json(["name", "ic"]);
      },
      searchGlobal: async (_req: any, res: any) => {
        calls.global += 1;
        return res.json({ columns: [], rows: [], total: 0 });
      },
      searchSimple: async (_req: any, res: any) => {
        calls.simple += 1;
        return res.json({ results: [], total: 0 });
      },
      advancedSearch: async (_req: any, res: any) => {
        calls.advanced += 1;
        return res.json({ rows: [], total: 0 });
      },
    } as any,
    authenticateToken: createTestAuthenticateToken(),
    searchRateLimiter: (_req, _res, next) => next(),
  });

  return {
    app,
    calls,
  };
}

function createSystemPermissionHarness() {
  const calls = {
    systemHealth: 0,
    explain: 0,
    chaos: 0,
    alertHistory: 0,
    rollupStatus: 0,
    rollupDrain: 0,
    rollupRetry: 0,
    rollupAutoHeal: 0,
    rollupRebuild: 0,
  };
  const app = createJsonTestApp();
  const requireMonitorAccess: RequestHandler = (req: any, res, next) => {
    if (String(req.headers["x-test-deny-monitor"] || "").trim() === "1") {
      res.status(403).json({ message: "Monitor access denied" });
      return;
    }
    next();
  };

  registerSystemRoutes(app, {
    authenticateToken: createTestAuthenticateToken(),
    requireRole: createTestRequireRole(),
    requireMonitorAccess,
    getMaintenanceStateCached: async () => ({
      maintenance: false,
      message: "",
      type: "soft",
      startTime: null,
      endTime: null,
    }),
    computeInternalMonitorSnapshot: () => {
      calls.systemHealth += 1;
      return {
        updatedAt: "2026-03-25T00:00:00.000Z",
      } as any;
    },
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
      updatedAt: "2026-03-25T00:00:00.000Z",
    } as any),
    getDbProtection: () => false,
    getRequestRate: () => 0,
    getLatencyP95: () => 0,
    getLocalCircuitSnapshots: () => ({
      ai: {} as any,
      db: {} as any,
      export: {} as any,
    }),
    getIntelligenceExplainability: () => {
      calls.explain += 1;
      return {
        anomalyBreakdown: [],
        correlationMatrix: [],
        slopeValues: [],
        forecastProjection: [],
        governanceState: {},
        chosenStrategy: null,
        decisionReason: "n/a",
      } as any;
    },
    injectChaos: () => {
      calls.chaos += 1;
      return {
        injected: {} as any,
        active: [],
      };
    },
    getCollectionRollupQueueStatus: async () => {
      calls.rollupStatus += 1;
      return {
        pendingCount: 0,
        runningCount: 0,
        retryCount: 0,
        oldestPendingAgeMs: 0,
      };
    },
    drainCollectionRollupQueue: async () => {
      calls.rollupDrain += 1;
      return {
        ok: true,
        action: "drain",
        message: "Drain requested.",
        snapshot: {
          pendingCount: 0,
          runningCount: 0,
          retryCount: 0,
          oldestPendingAgeMs: 0,
        },
      };
    },
    retryCollectionRollupFailures: async () => {
      calls.rollupRetry += 1;
      return {
        ok: true,
        action: "retry-failures",
        message: "Retry requested.",
        snapshot: {
          pendingCount: 0,
          runningCount: 0,
          retryCount: 0,
          oldestPendingAgeMs: 0,
        },
      };
    },
    autoHealCollectionRollupQueue: async () => {
      calls.rollupAutoHeal += 1;
      return {
        ok: true,
        action: "auto-heal",
        message: "Auto-heal requested.",
        snapshot: {
          pendingCount: 0,
          runningCount: 0,
          retryCount: 0,
          oldestPendingAgeMs: 0,
        },
      };
    },
    rebuildCollectionRollups: async () => {
      calls.rollupRebuild += 1;
      return {
        ok: true,
        action: "rebuild",
        message: "Rebuild requested.",
        snapshot: {
          pendingCount: 0,
          runningCount: 0,
          retryCount: 0,
          oldestPendingAgeMs: 0,
        },
      };
    },
    listMonitorAlertHistory: async () => {
      calls.alertHistory += 1;
      return [];
    },
    createAuditLog: async (data) => ({
      id: "audit-1",
      ...data,
    } as any),
    checkDbConnectivity: async () => true,
    getStartupHealthSnapshot: () => ({
      failed: false,
      failureDetails: null,
      failureReason: null,
      ready: true,
      stage: "ready",
      startedAt: "2026-03-25T00:00:00.000Z",
      updatedAt: "2026-03-25T00:00:01.000Z",
      validation: {
        warningCount: 0,
        warnings: [],
      },
    }),
  });

  return {
    app,
    calls,
  };
}

test("settings routes enforce role and tab visibility consistently", async () => {
  const { app, calls } = createSettingsPermissionHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/settings" },
      { anonymous: 401, user: 403, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "PATCH",
        path: "/api/settings",
        body: { key: "system_name", value: "SQR Next" },
      },
      { anonymous: 401, user: 403, admin: 200, superuser: 200 },
    );

    const deniedGet = await sendMatrixRequest(
      baseUrl,
      { method: "GET", path: "/api/settings" },
      "admin",
      { "x-test-deny-tabs": "settings" },
    );
    assert.equal(deniedGet.status, 403);

    const deniedPatch = await sendMatrixRequest(
      baseUrl,
      {
        method: "PATCH",
        path: "/api/settings",
        body: { key: "system_name", value: "SQR Next" },
      },
      "admin",
      { "x-test-deny-tabs": "settings" },
    );
    assert.equal(deniedPatch.status, 403);

    assert.equal(calls.listSettings, 2);
    assert.equal(calls.updateSetting, 2);
  } finally {
    await stopTestServer(server);
  }
});

test("operations routes enforce role and tab visibility consistently", async () => {
  const { app, calls } = createOperationsPermissionHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/analytics/summary" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/backups" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/audit-logs" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/debug/websocket-clients" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );

    const deniedAdminDashboard = await sendMatrixRequest(
      baseUrl,
      { method: "GET", path: "/api/analytics/summary" },
      "admin",
      { "x-test-deny-tabs": "dashboard" },
    );
    assert.equal(deniedAdminDashboard.status, 403);

    const deniedUserDashboard = await sendMatrixRequest(
      baseUrl,
      { method: "GET", path: "/api/analytics/summary" },
      "user",
      { "x-test-deny-tabs": "dashboard" },
    );
    assert.equal(deniedUserDashboard.status, 403);

    assert.equal(calls.summary, 3);
    assert.equal(calls.backups, 1);
    assert.equal(calls.auditLogs, 1);
    assert.equal(calls.debugSockets, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("auth admin routes enforce superuser-only access consistently", async () => {
  const { app, calls } = createAuthAdminPermissionHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/admin/users" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "POST",
        path: "/api/admin/users",
        body: {
          username: "managed.user",
          fullName: "Managed User",
          email: "managed@example.com",
          role: "user",
        },
      },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/accounts" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );

    assert.equal(calls.listManagedUsers, 1);
    assert.equal(calls.createManagedUser, 1);
    assert.equal(calls.getAccounts, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("collection admin routes enforce superuser-only access consistently", async () => {
  const { app, calls } = createCollectionAdminPermissionHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/collection/admins" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "POST",
        path: "/api/collection/admin-groups",
        body: { name: "Group Alpha" },
      },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "PUT",
        path: "/api/collection/nickname-assignments/admin-1",
        body: { nicknameIds: ["nickname-1"] },
      },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );

    assert.equal(calls.listAdmins, 1);
    assert.equal(calls.createAdminGroup, 1);
    assert.equal(calls.saveAssignments, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("activity routes enforce user/admin/superuser boundaries consistently", async () => {
  const { app, calls } = createActivityPermissionHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/activity/all" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "DELETE", path: "/api/activity/activity-1" },
      { anonymous: 401, user: 403, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "POST",
        path: "/api/activity/ban",
        body: { activityId: "activity-1" },
      },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/users/banned" },
      { anonymous: 401, user: 403, admin: 200, superuser: 200 },
    );

    const deniedUserTab = await sendMatrixRequest(
      baseUrl,
      { method: "GET", path: "/api/activity/all" },
      "user",
      { "x-test-deny-tabs": "activity" },
    );
    assert.equal(deniedUserTab.status, 403);

    const deniedAdminTab = await sendMatrixRequest(
      baseUrl,
      { method: "DELETE", path: "/api/activity/activity-1" },
      "admin",
      { "x-test-deny-tabs": "activity" },
    );
    assert.equal(deniedAdminTab.status, 403);

    assert.equal(calls.listActivities, 3);
    assert.equal(calls.deleteActivity, 2);
    assert.equal(calls.banActivity, 1);
    assert.equal(calls.listBannedUsers, 2);
  } finally {
    await stopTestServer(server);
  }
});

test("imports routes enforce analysis and delete permissions consistently", async () => {
  const { app, calls } = createImportsPermissionHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    await assertRoleMatrix(
      baseUrl,
      {
        method: "POST",
        path: "/api/imports",
        body: { name: "Import", filename: "import.xlsx", rows: [{ id: 1 }] },
      },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/imports/import-1/analyze" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/analyze/all" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "DELETE", path: "/api/imports/import-1" },
      { anonymous: 401, user: 403, admin: 200, superuser: 200 },
    );

    const deniedAnalysisTab = await sendMatrixRequest(
      baseUrl,
      { method: "GET", path: "/api/imports/import-1/analyze" },
      "admin",
      { "x-test-deny-tabs": "analysis" },
    );
    assert.equal(deniedAnalysisTab.status, 403);

    assert.equal(calls.createImport, 3);
    assert.equal(calls.analyzeImport, 3);
    assert.equal(calls.analyzeAll, 3);
    assert.equal(calls.deleteImport, 2);
  } finally {
    await stopTestServer(server);
  }
});

test("ai routes enforce authenticated-role access consistently", async () => {
  const { app, calls } = createAiPermissionHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/ai/config" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "POST",
        path: "/api/ai/search",
        body: { query: "hello" },
      },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "POST",
        path: "/api/ai/index/import/import-1",
        body: { batchSize: 10 },
      },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "POST",
        path: "/api/ai/chat",
        body: { message: "Hi" },
      },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );

    assert.equal(calls.config, 3);
    assert.equal(calls.search, 3);
    assert.equal(calls.indexImport, 3);
    assert.equal(calls.chat, 3);
  } finally {
    await stopTestServer(server);
  }
});

test("search routes require authentication but allow all authenticated roles", async () => {
  const { app, calls } = createSearchPermissionHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/search/columns" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/search/global?q=Alice" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/api/search?q=Alice" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "POST",
        path: "/api/search/advanced",
        body: { filters: [], logic: "AND", page: 1, limit: 50 },
      },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );

    assert.equal(calls.columns, 3);
    assert.equal(calls.global, 3);
    assert.equal(calls.simple, 3);
    assert.equal(calls.advanced, 3);
  } finally {
    await stopTestServer(server);
  }
});

test("system monitor routes enforce monitor-access and chaos role boundaries consistently", async () => {
  const { app, calls } = createSystemPermissionHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/internal/system-health" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/internal/intelligence/explain" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "GET", path: "/internal/alerts/history" },
      { anonymous: 401, user: 200, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      {
        method: "POST",
        path: "/internal/chaos/inject",
        body: { type: "cpu_spike", magnitude: 1.2, durationMs: 5000 },
      },
      { anonymous: 401, user: 403, admin: 200, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "POST", path: "/internal/rollup-refresh/status" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "POST", path: "/internal/rollup-refresh/drain" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "POST", path: "/internal/rollup-refresh/retry-failures" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "POST", path: "/internal/rollup-refresh/auto-heal" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );
    await assertRoleMatrix(
      baseUrl,
      { method: "POST", path: "/internal/rollup-refresh/rebuild" },
      { anonymous: 401, user: 403, admin: 403, superuser: 200 },
    );

    for (const role of ["user", "admin", "superuser"] as const) {
      const deniedHealth = await sendMatrixRequest(
        baseUrl,
        { method: "GET", path: "/internal/system-health" },
        role,
        { "x-test-deny-monitor": "1" },
      );
      assert.equal(deniedHealth.status, 403);

      const deniedExplain = await sendMatrixRequest(
        baseUrl,
        { method: "GET", path: "/internal/intelligence/explain" },
        role,
        { "x-test-deny-monitor": "1" },
      );
      assert.equal(deniedExplain.status, 403);
    }

    assert.equal(calls.systemHealth, 3);
    assert.equal(calls.explain, 3);
    assert.equal(calls.alertHistory, 3);
    assert.equal(calls.chaos, 2);
    assert.equal(calls.rollupStatus, 1);
    assert.equal(calls.rollupDrain, 1);
    assert.equal(calls.rollupRetry, 1);
    assert.equal(calls.rollupAutoHeal, 1);
    assert.equal(calls.rollupRebuild, 1);
  } finally {
    await stopTestServer(server);
  }
});
