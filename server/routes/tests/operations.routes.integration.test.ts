import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { WebSocket } from "ws";
import { createOperationsController } from "../../controllers/operations.controller";
import { AuditLogOperationsService } from "../../services/audit-log-operations.service";
import { BackupJobQueueService } from "../../services/backup-job-queue.service";
import { BackupOperationsService } from "../../services/backup-operations.service";
import { OperationsAnalyticsService } from "../../services/operations-analytics.service";
import { createInMemoryBackupJobRepository } from "../../test-support/backup-job-queue-test-double";
import { registerOperationsRoutes } from "../operations.routes";
import {
  allowAllTabs,
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type AuditLogOperationsStorage = ConstructorParameters<typeof AuditLogOperationsService>[0];
type AuditLogOperationsRepository = ConstructorParameters<typeof AuditLogOperationsService>[1];
type BackupOperationsStorage = ConstructorParameters<typeof BackupOperationsService>[0];
type BackupOperationsBackupsRepository = ConstructorParameters<typeof BackupOperationsService>[1];
type OperationsAnalyticsRepository = ConstructorParameters<typeof OperationsAnalyticsService>[0];
type AuditEntry = Parameters<AuditLogOperationsStorage["createAuditLog"]>[0];
type AuditRow = Awaited<ReturnType<AuditLogOperationsRepository["getAuditLogs"]>>[number];
type CreateBackupData = Parameters<BackupOperationsBackupsRepository["createBackupFromPreparedPayload"]>[0] & {
  backupData?: string;
};
type BackupRow = NonNullable<Awaited<ReturnType<BackupOperationsBackupsRepository["getBackupById"]>>>;

function createAuditRow(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: "audit-1",
    action: "LOGIN",
    performedBy: "super.user",
    requestId: null,
    targetUser: null,
    targetResource: null,
    details: "Logged in",
    timestamp: new Date("2026-03-19T10:00:00.000Z"),
    ...overrides,
  };
}

function createBackupRow(overrides: Partial<BackupRow> = {}): BackupRow {
  return {
    id: "backup-1",
    name: "Nightly Backup",
    createdAt: new Date("2026-03-20T00:00:00.000Z"),
    createdBy: "super.user",
    backupData: JSON.stringify({
      imports: [],
      dataRows: [],
      users: [],
      auditLogs: [],
      collectionRecords: [],
      collectionRecordReceipts: [],
    }),
    metadata: JSON.stringify({
      timestamp: "2026-03-20T00:00:00.000Z",
    }),
    ...overrides,
  };
}

async function readExportPayloadJson(response: Response) {
  return JSON.parse(await response.text()) as {
    id: string;
    backupData: {
      imports: unknown[];
    };
  };
}

function createOperationsRouteHarness(options?: {
  exportCircuitOpen?: boolean;
  backupOperationTimeoutMs?: number;
  backupCreateDelayMs?: number;
  backupExportDelayMs?: number;
  backupRestoreDelayMs?: number;
  maxPayloadBytes?: number;
  operationsDebugRoutesEnabled?: boolean;
}) {
  const auditLogs: AuditEntry[] = [];
  const cleanupCalls: Date[] = [];
  const topUserCalls: number[] = [];
  const createBackupCalls: CreateBackupData[] = [];
  const restoreCalls: unknown[] = [];
  const deleteBackupCalls: string[] = [];
  const tempPayloadPaths: string[] = [];
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const backups = new Map<string, BackupRow>([
    [
      "backup-1",
      createBackupRow(),
    ],
  ]);

  const storage: AuditLogOperationsStorage & BackupOperationsStorage = {
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return createAuditRow({
        ...entry,
        id: `audit-${auditLogs.length}`,
        targetUser: entry.targetUser ?? null,
        targetResource: entry.targetResource ?? null,
        details: entry.details ?? null,
        requestId: entry.requestId ?? null,
        timestamp: new Date(),
      });
    },
  };

  const auditRepository: AuditLogOperationsRepository = {
    getAuditLogs: async () => [createAuditRow()],
    listAuditLogsPage: async () => ({
      logs: [createAuditRow()],
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
  };

  const analyticsRepository: OperationsAnalyticsRepository = {
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
  };

  const backupsRepository: BackupOperationsBackupsRepository = {
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
    prepareBackupPayloadFileForCreate: async () => {
      const exportDelayMs = options?.backupExportDelayMs ?? 0;
      if (exportDelayMs > 0) {
        await sleep(exportDelayMs);
      }
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "backup-route-test-"));
      const tempFilePath = path.join(tempDir, "payload.json");
      tempPayloadPaths.push(tempFilePath);
      await fs.writeFile(
        tempFilePath,
        JSON.stringify({
          imports: [{ id: "import-1" }],
          dataRows: [{ id: "row-1" }, { id: "row-2" }],
          users: [{ username: "super.user" }],
          auditLogs: [{ id: "audit-1" }],
          collectionRecords: [{ id: "record-1" }],
          collectionRecordReceipts: [{ id: "receipt-1" }],
        }),
        "utf8",
      );
      return {
        tempFilePath,
        payloadChecksumSha256:
          "6b742b4b7e22f7ca0d0ff3c80457d22c3c83d3175de0b08073ec86492332e930",
        counts: {
          importsCount: 1,
          dataRowsCount: 2,
          usersCount: 1,
          auditLogsCount: 1,
          collectionRecordsCount: 1,
          collectionRecordReceiptsCount: 1,
        },
        payloadBytes: (await fs.stat(tempFilePath)).size,
        tempPayloadEncrypted: false,
        cleanup: async () => {
          await fs.rm(tempDir, { recursive: true, force: true });
        },
      };
    },
    readPreparedBackupPayloadForStorage: async () => {
      throw new Error("Legacy prepared backup payload read path should not be used.");
    },
    createBackup: async () => {
      throw new Error("Legacy createBackup path should not be used.");
    },
    createBackupFromPreparedPayload: async (data: CreateBackupData) => {
      const createDelayMs = options?.backupCreateDelayMs ?? 0;
      if (createDelayMs > 0) {
        await sleep(createDelayMs);
      }
      const backupData = data.preparedBackupPayload.tempPayloadEncrypted
        && typeof data.preparedBackupPayload.tempPayloadStoragePrefix === "string"
        ? `${data.preparedBackupPayload.tempPayloadStoragePrefix}${(await fs.readFile(data.preparedBackupPayload.tempFilePath)).toString("base64")}`
        : await fs.readFile(data.preparedBackupPayload.tempFilePath, "utf8");
      createBackupCalls.push({
        ...data,
        backupData,
      });
      return createBackupRow({
        id: "backup-2",
        name: data.name,
        createdAt: new Date("2026-03-20T01:00:00.000Z"),
        createdBy: data.createdBy,
        backupData: "",
        metadata: data.metadata ?? null,
      });
    },
    getBackupMetadataById: async (id: string) => {
      const backup = backups.get(id);
      if (!backup) return undefined;
      return {
        ...backup,
        backupData: "",
      };
    },
    iterateBackupDataJsonChunksById: async (id: string) => {
      const exportDelayMs = options?.backupExportDelayMs ?? 0;
      const backup = backups.get(id);
      if (!backup) {
        return undefined;
      }
      const backupData = String(backup.backupData || "");
      return (async function* () {
        if (exportDelayMs > 0) {
          await sleep(exportDelayMs);
        }
        if (backupData) {
          yield backupData;
        }
      })();
    },
    getBackupById: async (id: string) => {
      const exportDelayMs = options?.backupExportDelayMs ?? 0;
      if (exportDelayMs > 0) {
        await sleep(exportDelayMs);
      }
      return backups.get(id);
    },
    restoreFromBackup: async (backupData: unknown) => {
      const restoreDelayMs = options?.backupRestoreDelayMs ?? 0;
      if (restoreDelayMs > 0) {
        await sleep(restoreDelayMs);
      }
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
  };

  const withExportCircuit = async <T>(fn: () => Promise<T>) => {
    if (options?.exportCircuitOpen) {
      throw new Error("circuit-open");
    }
    return fn();
  };
  const backupOperationsService = new BackupOperationsService(
    storage,
    backupsRepository,
    withExportCircuit,
    (error) => (error as Error)?.message === "circuit-open",
    options?.maxPayloadBytes == null
      ? undefined
      : {
        maxPayloadBytes: options.maxPayloadBytes,
      },
  );
  const backupJobQueueService = new BackupJobQueueService({
    repository: createInMemoryBackupJobRepository(),
    executeCreate: (params) => backupOperationsService.createBackup(params),
    executeRestore: (params) => backupOperationsService.restoreBackup(params),
  });
  const connectedClients = new Map<string, WebSocket>([
    ["activity-1", { readyState: 1 } as unknown as WebSocket],
    ["activity-2", { readyState: 1 } as unknown as WebSocket],
  ]);

  const app = createJsonTestApp();
  registerOperationsRoutes(app, {
    operationsController: createOperationsController({
      auditLogOperationsService: new AuditLogOperationsService(storage, auditRepository),
      backupOperationsService,
      backupJobQueueService,
      operationsAnalyticsService: new OperationsAnalyticsService(analyticsRepository),
      connectedClients,
      requestTimeouts: {
        backupOperationMs: options?.backupOperationTimeoutMs,
      },
    }),
    authenticateToken: createTestAuthenticateToken({
      userId: "super-1",
      username: "super.user",
      role: "superuser",
      activityId: "activity-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
    operationsDebugRoutesEnabled: options?.operationsDebugRoutesEnabled,
  });

  return {
    app,
    auditLogs,
    cleanupCalls,
    topUserCalls,
    createBackupCalls,
    restoreCalls,
    deleteBackupCalls,
    tempPayloadPaths,
  };
}

async function waitForBackupJob(baseUrl: string, jobId: string) {
  const deadline = Date.now() + 1500;

  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/backups/jobs/${jobId}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    if (payload.status === "completed" || payload.status === "failed") {
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.fail(`Backup job ${jobId} did not finish before timeout.`);
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

test("GET /api/analytics/top-users accepts pageSize and clamps it to at least one", async () => {
  const { app, topUserCalls } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/analytics/top-users?pageSize=0`);
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

test("POST /api/backups returns 413 when the payload exceeds the configured size limit", async () => {
  const { app, createBackupCalls, auditLogs } = createOperationsRouteHarness({
    maxPayloadBytes: 32,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Oversized Backup" }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      message:
        "Backup payload exceeds the configured 32 bytes limit. Narrow the dataset or increase BACKUP_MAX_PAYLOAD_BYTES.",
    });
    assert.equal(createBackupCalls.length, 0);
    assert.equal(auditLogs.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/backups?async=1 queues backup creation and exposes job status", async () => {
  const { app, createBackupCalls, auditLogs } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups?async=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Queued Backup" }),
    });

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.message, "Backup creation queued.");
    assert.equal(payload.job.type, "create");
    assert.ok(["queued", "running", "completed"].includes(payload.job.status));

    const finalJob = await waitForBackupJob(baseUrl, payload.job.id);
    assert.equal(finalJob.type, "create");
    assert.equal(finalJob.status, "completed");
    assert.equal(finalJob.backupName, "Queued Backup");
    assert.equal((finalJob.result as Record<string, unknown>).id, "backup-2");
    assert.equal(createBackupCalls.length, 1);
    assert.equal(auditLogs.length, 1);
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
    const payload = await readExportPayloadJson(response);
    assert.equal(payload.id, "backup-1");
    assert.equal(Array.isArray(payload.backupData.imports), true);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "DOWNLOAD_BACKUP_EXPORT");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/backups/:id/export returns 413 when the payload exceeds the configured size limit", async () => {
  const { app, auditLogs } = createOperationsRouteHarness({
    maxPayloadBytes: 32,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups/backup-1/export`);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      message:
        "Backup payload exceeds the configured 32 bytes limit. Narrow the dataset or increase BACKUP_MAX_PAYLOAD_BYTES.",
    });
    assert.equal(auditLogs.length, 0);
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

test("GET /api/backups/:id/export returns 504 when the request deadline is exceeded", async () => {
  const { app } = createOperationsRouteHarness({
    backupOperationTimeoutMs: 15,
    backupExportDelayMs: 50,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups/backup-1/export`);
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Backup export is taking longer than expected. Please retry in a moment.",
      error: {
        code: "REQUEST_TIMEOUT",
        message: "Backup export is taking longer than expected. Please retry in a moment.",
        details: {
          operation: "backup-export",
          timeoutMs: 15,
        },
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/backups/:id/restore?async=1 queues restore and exposes job status", async () => {
  const { app, restoreCalls, auditLogs } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups/backup-1/restore?async=1`, {
      method: "POST",
    });

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.message, "Backup restore queued.");
    assert.equal(payload.job.type, "restore");
    assert.ok(["queued", "running", "completed"].includes(payload.job.status));

    const finalJob = await waitForBackupJob(baseUrl, payload.job.id);
    assert.equal(finalJob.type, "restore");
    assert.equal(finalJob.status, "completed");
    assert.equal(finalJob.backupId, "backup-1");
    assert.equal((finalJob.result as Record<string, unknown>).success, true);
    assert.equal(restoreCalls.length, 1);
    assert.equal(auditLogs.length, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/backups/jobs/:jobId returns 404 for unknown background jobs", async () => {
  const { app } = createOperationsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/backups/jobs/missing-job`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      message: "Backup job not found",
    });
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
  const { app } = createOperationsRouteHarness({
    operationsDebugRoutesEnabled: true,
  });
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
