import assert from "node:assert/strict";
import test from "node:test";
import type { SystemSettingItem } from "../../config/system-settings";
import { registerSettingsRoutes } from "../settings.routes";
import type { PostgresStorage } from "../../storage-postgres";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  createTestRequireTabAccess,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetResource?: string;
  details?: string;
};

type UpdateSettingResult = {
  status: "updated" | "unchanged" | "forbidden" | "not_found" | "requires_confirmation" | "invalid";
  message: string;
  setting?: SystemSettingItem;
  shouldBroadcast?: boolean;
};

function createSetting(value: string, overrides: Partial<SystemSettingItem> = {}): SystemSettingItem {
  return {
    key: "system_name",
    label: "System Name",
    description: null,
    type: "text",
    value,
    defaultValue: "SQR",
    isCritical: false,
    updatedAt: new Date("2026-03-19T00:00:00.000Z"),
    permission: {
      canView: true,
      canEdit: true,
    },
    options: [],
    ...overrides,
  };
}

function createSettingsRouteHarness(options?: {
  updateResult?: UpdateSettingResult;
  maintenanceState?: {
    maintenance: boolean;
    message: string;
    type: "soft" | "hard";
    startTime: string | null;
    endTime: string | null;
  };
}) {
  const auditLogs: AuditEntry[] = [];
  const broadcasts: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  let clearTabVisibilityCacheCount = 0;
  let invalidateRuntimeSettingsCacheCount = 0;
  let invalidateMaintenanceCacheCount = 0;
  let getMaintenanceStateCachedCount = 0;

  const storage = {
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
    getRoleTabVisibility: async (role: string) => ({
      home: role !== "user",
      settings: role !== "user",
    }),
    getSettingsForRole: async () => ([
      {
        id: "general",
        name: "General",
        description: null,
        settings: [createSetting("SQR")],
      },
    ]),
    updateSystemSetting: async (params: Record<string, unknown>) => {
      updateCalls.push(params);
      return options?.updateResult ?? {
        status: "updated",
        message: "Setting updated.",
        setting: createSetting("SQR Next"),
        shouldBroadcast: false,
      };
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  const app = createJsonTestApp();
  registerSettingsRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: createTestRequireTabAccess(),
    clearTabVisibilityCache: () => {
      clearTabVisibilityCacheCount += 1;
    },
    invalidateRuntimeSettingsCache: () => {
      invalidateRuntimeSettingsCacheCount += 1;
    },
    invalidateMaintenanceCache: () => {
      invalidateMaintenanceCacheCount += 1;
    },
    getMaintenanceStateCached: async () => {
      getMaintenanceStateCachedCount += 1;
      return options?.maintenanceState ?? {
        maintenance: true,
        message: "Maintenance window",
        type: "soft",
        startTime: "2026-03-19T01:00:00.000Z",
        endTime: "2026-03-19T02:00:00.000Z",
      };
    },
    broadcastWsMessage: (payload) => {
      broadcasts.push(payload);
    },
  });

  return {
    app,
    auditLogs,
    broadcasts,
    updateCalls,
    getClearTabVisibilityCacheCount: () => clearTabVisibilityCacheCount,
    getInvalidateRuntimeSettingsCacheCount: () => invalidateRuntimeSettingsCacheCount,
    getInvalidateMaintenanceCacheCount: () => invalidateMaintenanceCacheCount,
    getMaintenanceStateCachedCount: () => getMaintenanceStateCachedCount,
  };
}

test("GET /api/app-config returns config with no-store cache headers", async () => {
  const { app } = createSettingsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/app-config`, {
      headers: {
        "x-test-username": "viewer.user",
        "x-test-role": "user",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate, proxy-revalidate");
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("expires"), "0");

    const payload = await response.json();
    assert.equal(payload.systemName, "SQR");
    assert.equal(payload.viewerRowsPerPage, 100);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/settings/tab-visibility returns role-scoped tab visibility", async () => {
  const { app } = createSettingsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/settings/tab-visibility`, {
      headers: {
        "x-test-username": "user.one",
        "x-test-role": "user",
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.role, "user");
    assert.deepEqual(payload.tabs, {
      home: false,
      settings: false,
    });
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/settings validates the key before service work begins", async () => {
  const { app, updateCalls } = createSettingsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: "   ",
        value: "ignored",
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      message: "Invalid setting key",
    });
    assert.equal(updateCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/settings denies admin access when the settings tab is disabled", async () => {
  const { app } = createSettingsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/settings`, {
      headers: {
        "x-test-username": "admin.user",
        "x-test-role": "admin",
        "x-test-deny-tabs": "settings",
      },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      message: "Tab 'settings' is disabled for role 'admin'",
    });
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/settings updates a non-critical setting and broadcasts a settings update", async () => {
  const { app, auditLogs, broadcasts, updateCalls, getClearTabVisibilityCacheCount, getInvalidateRuntimeSettingsCacheCount, getInvalidateMaintenanceCacheCount, getMaintenanceStateCachedCount } =
    createSettingsRouteHarness({
      updateResult: {
        status: "updated",
        message: "Setting updated.",
        setting: createSetting("SQR Next"),
        shouldBroadcast: false,
      },
    });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: "system_name",
        value: "SQR Next",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.status, "updated");
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].role, "admin");
    assert.equal(updateCalls[0].settingKey, "system_name");
    assert.equal(updateCalls[0].updatedBy, "admin.user");
    assert.equal(getClearTabVisibilityCacheCount(), 1);
    assert.equal(getInvalidateRuntimeSettingsCacheCount(), 1);
    assert.equal(getInvalidateMaintenanceCacheCount(), 0);
    assert.equal(getMaintenanceStateCachedCount(), 0);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "SETTING_UPDATED");
    assert.equal(auditLogs[0].performedBy, "admin.user");
    assert.deepEqual(broadcasts, [
      {
        type: "settings_updated",
        key: "system_name",
        updatedBy: "admin.user",
      },
    ]);
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/settings broadcasts maintenance changes for broadcast-worthy updates", async () => {
  const { app, auditLogs, broadcasts, getInvalidateMaintenanceCacheCount, getMaintenanceStateCachedCount } =
    createSettingsRouteHarness({
      updateResult: {
        status: "updated",
        message: "Maintenance updated.",
        setting: createSetting("1", {
          key: "maintenance_mode",
          label: "Maintenance Mode",
          type: "boolean",
          isCritical: true,
        }),
        shouldBroadcast: true,
      },
      maintenanceState: {
        maintenance: true,
        message: "Read only window",
        type: "hard",
        startTime: "2026-03-19T03:00:00.000Z",
        endTime: "2026-03-19T04:00:00.000Z",
      },
    });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: "maintenance_mode",
        value: true,
        confirmCritical: true,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.status, "updated");
    assert.equal(getInvalidateMaintenanceCacheCount(), 1);
    assert.equal(getMaintenanceStateCachedCount(), 1);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "CRITICAL_SETTING_UPDATED");
    assert.deepEqual(broadcasts, [
      {
        type: "maintenance_update",
        maintenance: true,
        message: "Read only window",
        mode: "hard",
        startTime: "2026-03-19T03:00:00.000Z",
        endTime: "2026-03-19T04:00:00.000Z",
      },
    ]);
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/settings maps confirmation-required updates to HTTP 409", async () => {
  const { app, auditLogs, broadcasts } = createSettingsRouteHarness({
    updateResult: {
      status: "requires_confirmation",
      message: "Confirmation required.",
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: "maintenance_mode",
        value: true,
      }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      message: "Confirmation required.",
      requiresConfirmation: true,
    });
    assert.equal(auditLogs.length, 0);
    assert.equal(broadcasts.length, 0);
  } finally {
    await stopTestServer(server);
  }
});
