import assert from "node:assert/strict";
import test from "node:test";
import { createOperationsController } from "../../controllers/operations.controller";
import { AuditLogOperationsService } from "../../services/audit-log-operations.service";
import { BackupOperationsService } from "../../services/backup-operations.service";
import { OperationsAnalyticsService } from "../../services/operations-analytics.service";
import { registerOperationsRoutes } from "../operations.routes";
import {
  allowAllTabs,
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetResource?: string;
  details?: string;
};

function createOperationsRouteHarness(options?: {
  exportCircuitOpen?: boolean;
}) {
  const auditLogs: AuditEntry[] = [];
  const cleanupCalls: Date[] = [];
  const topUserCalls: number[] = [];
  const createBackupCalls: Array<Record<string, unknown>> = [];
  const restoreCalls: unknown[] = [];
  const deleteBackupCalls: string[] = [];

  const backups = new Map<string, any>([
    [
      "backup-1",
      {
        id: "backup-1",
        name: "Nightly Backup",
        createdAt: new Date("2026-03-20T00:00:00.000Z").toISOString(),
        createdBy: "super.user",
        backupData: JSON.stringify({
          imports: [],
          dataRows: [],
          users: [],
          auditLogs: [],
          collectionRecords: [],
          collectionRecordReceipts: [],
        }),
        metadata: {
          timestamp: "2026-03-20T00:00:00.000Z",
        },
      },
    ],
  ]);

  const storage = {
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as any;

  const auditRepository = {
    getAuditLogs: async () => [
      {
        id: "audit-1",
        action: "LOGIN",
        performedBy: "super.user",
        targetUser: null,
        targetResource: null,
        details: "Logged in",
        timestamp: new Date("2026-03-19T10:00:00.000Z"),
      },
    ],
    listAuditLogsPage: async () => ({
      logs: [
        {
          id: "audit-1",
          action: "LOGIN",
          performedBy: "super.user",
          targetUser: null,
          targetResource: null,
          details: "Logged in",
          timestamp: new Date("2026-03-19T10:00:00.000Z"),
        },
      ],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    }),
    getAuditLogStats: async () => ({
      totalLogs: 12,
      todayLogs: 3,
      actionBreakdown: {
        LOGIN: 5,
      },
    }),
    cleanupAuditLogsOlderThan: async (cutoffDate: Date) => {
      cleanupCalls.push(cutoffDate);
      return 7;
    },
  } as any;

  const analyticsRepository = {
    getDashboardSummary: async () => ({
      totalUsers: 3,
      activeSessions: 1,
      loginsToday: 2,
      totalDataRows: 10,
      totalImports: 2,
      bannedUsers: 0,
      collectionRecordVersionConflicts24h: 4,
      loginFailures24h: 6,
      backupActions24h: 3,
    }),
    getLoginTrends: async (days: number) => [{ date: "2026-03-20", logins: days, logouts: 0 }],
    getTopActiveUsers: async (limit: number) => {
      topUserCalls.push(limit);
      return [{ username: "super.user", role: "superuser", loginCount: 9, lastLogin: null }];
    },
    getPeakHours: async () => [{ hour: 9, count: 4 }],
    getRoleDistribution: async () => [{ role: "superuser", count: 1 }],
  } as any;

  const backupsRepository = {
    listBackupsPage: async () => ({
      backups: Array.from(backups.values()).map((backup) => ({
        ...backup,
        backupData: "",
      })),
      page: 1,
      pageSize: 25,
      total: backups.size,
      totalPages: 1,
    }),
    getBackupDataForExport: async () => ({
      imports: [{ id: "import-1" }],
      dataRows: [{ id: "row-1" }, { id: "row-2" }],
      users: [{ username: "super.user" }],
      auditLogs: [{ id: "audit-1" }],
      collectionRecords: [{ id: "record-1" }],
      collectionRecordReceipts: [{ id: "receipt-1" }],
    }),
    createBackup: async (data: Record<string, unknown>) => {
      createBackupCalls.push(data);
      return {
        id: "backup-2",
        name: data.name,
        createdAt: new Date("2026-03-20T01:00:00.000Z").toISOString(),
        createdBy: data.createdBy,
        backupData: "",
        metadata: JSON.parse(String(data.metadata || "{}")),
      };
    },
    getBackupMetadataById: async (id: string) => {
      const backup = backups.get(id);
      if (!backup) return undefined;
      return {
        ...backup,
        backupData: "",
      };
    },
    getBackupById: async (id: string) => backups.get(id),
    restoreFromBackup: async (backupData: unknown) => {
      restoreCalls.push(backupData);
      return {
        success: true,
        stats: {
          imports: { processed: 1, inserted: 1, skipped: 0, reactivated: 0 },
          dataRows: { processed: 2, inserted: 2, skipped: 0, reactivated: 0 },
          users: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
          auditLogs: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
          collectionRecords: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
          collectionRecordReceipts: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
          warnings: [],
          totalProcessed: 3,
          totalInserted: 3,
          totalSkipped: 0,
          totalReactivated: 0,
        },
      };
    },
    deleteBackup: async (id: string) => {
      deleteBackupCalls.push(id);
      return backups.delete(id);
    },
  } as any;

  const withExportCircuit = async <T>(fn: () => Promise<T>) => {
    if (options?.exportCircuitOpen) {
      throw new Error("circuit-open");
    }
    return fn();
  };

  const app = createJsonTestApp();
  registerOperationsRoutes(app, {
    operationsController: createOperationsController({
      auditLogOperationsService: new AuditLogOperationsService(storage, auditRepository),
      backupOperationsService: new BackupOperationsService(
        storage,
        backupsRepository,
        withExportCircuit,
        (error) => (error as Error)?.message === "circuit-open",
      ),
      operationsAnalyticsService: new OperationsAnalyticsService(analyticsRepository),
      connectedClients: new Map([
        ["activity-1", {} as any],
        ["activity-2", {} as any],
      ]),
    }),
    authenticateToken: createTestAuthenticateToken({
      userId: "super-1",
      username: "super.user",
      role: "superuser",
      activityId: "activity-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  return {
    app,
    auditLogs,
    cleanupCalls,
    topUserCalls,
    createBackupCalls,
    restoreCalls,
    deleteBackupCalls,
  };
}

test("GET /api/audit-logs returns audit log rows", async () => {
  const { app } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/audit-logs`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.logs.length, 1);
    assert.equal(payload.logs[0].action, "LOGIN");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/audit-logs requires superuser role", async () => {
  const { app } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: {
        "x-test-role": "admin",
      },
    });
    assert.equal(response.status, 403);
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/audit-logs/cleanup clamps the cutoff and writes an audit log", async () => {
  const { app, cleanupCalls, auditLogs } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const before = Date.now();
    const response = await fetch(`${baseUrl}/api/audit-logs/cleanup`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ olderThanDays: 0 }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      deletedCount: 7,
      message: "Cleanup completed",
    });
    assert.equal(cleanupCalls.length, 1);
    const hours = (before - cleanupCalls[0].getTime()) / (1000 * 60 * 60);
    assert.ok(hours >= 23 && hours <= 25);
    assert.deepEqual(auditLogs, [{
      action: "CLEANUP_AUDIT_LOGS",
      performedBy: "super.user",
      details: "Cleanup requested for logs older than 1 days",
    }]);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/analytics/summary includes stale-record conflict frequency for monitoring", async () => {
  const { app } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/analytics/summary`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.collectionRecordVersionConflicts24h, 4);
    assert.equal(payload.loginFailures24h, 6);
    assert.equal(payload.backupActions24h, 3);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/analytics/top-users clamps limit to at least one", async () => {
  const { app, topUserCalls } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/analytics/top-users?limit=0`);
    assert.equal(response.status, 200);
    assert.deepEqual(topUserCalls, [1]);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/backups returns 503 when the export circuit is open", async () => {
  const { app, createBackupCalls, auditLogs } = createOperationsRouteHarness({
    exportCircuitOpen: true,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Manual Backup" }),
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      message: "Export circuit is OPEN. Retry later.",
    });
    assert.equal(createBackupCalls.length, 0);
    assert.equal(auditLogs.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/backups creates a backup and writes an audit log", async () => {
  const { app, createBackupCalls, auditLogs } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Manual Backup" }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, "backup-2");
    assert.equal(createBackupCalls.length, 1);
    assert.equal(createBackupCalls[0].createdBy, "super.user");
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "CREATE_BACKUP");
    assert.equal(auditLogs[0].performedBy, "super.user");
    assert.equal(auditLogs[0].targetResource, "Manual Backup");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/backups/:id/export returns an attachment and audits the download", async () => {
  const { app, auditLogs } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups/backup-1/export`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition") || "", /attachment; filename=/i);
    const payload = JSON.parse(await response.text());
    assert.equal(payload.id, "backup-1");
    assert.equal(Array.isArray(payload.backupData.imports), true);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "DOWNLOAD_BACKUP_EXPORT");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/backups/:id/restore returns 404 when the backup does not exist", async () => {
  const { app, restoreCalls, auditLogs } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups/missing/restore`, {
      method: "POST",
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      message: "Backup not found",
    });
    assert.equal(restoreCalls.length, 0);
    assert.equal(auditLogs.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/backups/:id/restore returns restore details and audits the operation", async () => {
  const { app, restoreCalls, auditLogs } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups/backup-1/restore`, {
      method: "POST",
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.backupId, "backup-1");
    assert.equal(payload.backupName, "Nightly Backup");
    assert.equal(restoreCalls.length, 1);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "RESTORE_BACKUP");
    assert.equal(auditLogs[0].targetResource, "Nightly Backup");
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/backups/:id deletes the backup and audits the action", async () => {
  const { app, deleteBackupCalls, auditLogs } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups/backup-1`, {
      method: "DELETE",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(deleteBackupCalls, ["backup-1"]);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "DELETE_BACKUP");
    assert.equal(auditLogs[0].targetResource, "Nightly Backup");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/backups requires superuser role", async () => {
  const { app } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups`, {
      headers: {
        "x-test-role": "admin",
      },
    });
    assert.equal(response.status, 403);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/debug/websocket-clients returns the connected activity ids", async () => {
  const { app } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/debug/websocket-clients`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      count: 2,
      clients: ["activity-1", "activity-2"],
    });
  } finally {
    await stopTestServer(server);
  }
});
