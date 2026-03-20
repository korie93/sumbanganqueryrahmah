import assert from "node:assert/strict";
import test from "node:test";
import { BackupOperationsService } from "../backup-operations.service";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetResource?: string;
  details?: string;
};

function createBackupOperationsHarness(options?: {
  exportCircuitOpen?: boolean;
}) {
  const auditLogs: AuditEntry[] = [];
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
  };

  const backupsRepository = {
    getBackups: async () =>
      Array.from(backups.values()).map((backup) => ({
        ...backup,
        backupData: "",
      })),
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
  };

  const withExportCircuit = async <T>(fn: () => Promise<T>) => {
    if (options?.exportCircuitOpen) {
      throw new Error("circuit-open");
    }
    return fn();
  };

  return {
    service: new BackupOperationsService(
      storage as any,
      backupsRepository as any,
      withExportCircuit,
      (error) => (error as Error)?.message === "circuit-open",
    ),
    auditLogs,
    createBackupCalls,
    restoreCalls,
    deleteBackupCalls,
  };
}

test("BackupOperationsService createBackup returns 503 when the export circuit is open", async () => {
  const { service, createBackupCalls, auditLogs } = createBackupOperationsHarness({
    exportCircuitOpen: true,
  });

  const result = await service.createBackup({
    name: "Manual Backup",
    username: "super.user",
  });

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, {
    message: "Export circuit is OPEN. Retry later.",
  });
  assert.equal(createBackupCalls.length, 0);
  assert.equal(auditLogs.length, 0);
});

test("BackupOperationsService createBackup persists backup metadata and audits export", async () => {
  const { service, createBackupCalls, auditLogs } = createBackupOperationsHarness();

  const result = await service.createBackup({
    name: "Manual Backup",
    username: "super.user",
  });

  assert.equal(result.statusCode, 200);
  assert.equal((result.body as any).id, "backup-2");
  assert.equal(createBackupCalls.length, 1);
  assert.equal(createBackupCalls[0].createdBy, "super.user");
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "CREATE_BACKUP");
  assert.equal(auditLogs[0].performedBy, "super.user");
  assert.equal(auditLogs[0].targetResource, "Manual Backup");

  const metadata = JSON.parse(String(createBackupCalls[0].metadata));
  assert.equal(metadata.importsCount, 1);
  assert.equal(metadata.dataRowsCount, 2);
  assert.equal(metadata.usersCount, 1);
  assert.equal(metadata.auditLogsCount, 1);
  assert.equal(metadata.collectionRecordsCount, 1);
  assert.equal(metadata.collectionRecordReceiptsCount, 1);

  const auditDetails = JSON.parse(String(auditLogs[0].details));
  assert.equal(typeof auditDetails.durationMs, "number");
});

test("BackupOperationsService restoreBackup returns 404 when the backup does not exist", async () => {
  const { service, restoreCalls, auditLogs } = createBackupOperationsHarness();

  const result = await service.restoreBackup({
    backupId: "missing",
    username: "super.user",
  });

  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body, {
    message: "Backup not found",
  });
  assert.equal(restoreCalls.length, 0);
  assert.equal(auditLogs.length, 0);
});

test("BackupOperationsService restoreBackup returns restore details and audit metadata", async () => {
  const { service, restoreCalls, auditLogs } = createBackupOperationsHarness();

  const result = await service.restoreBackup({
    backupId: "backup-1",
    username: "super.user",
  });

  assert.equal(result.statusCode, 200);
  assert.equal((result.body as any).success, true);
  assert.equal((result.body as any).backupId, "backup-1");
  assert.equal((result.body as any).backupName, "Nightly Backup");
  assert.equal(restoreCalls.length, 1);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "RESTORE_BACKUP");
  assert.equal(auditLogs[0].targetResource, "Nightly Backup");

  const auditDetails = JSON.parse(String(auditLogs[0].details));
  assert.equal(auditDetails.totalProcessed, 3);
  assert.equal(auditDetails.totalInserted, 3);
  assert.equal(auditDetails.warningCount, 0);
  assert.equal(typeof auditDetails.durationMs, "number");
});

test("BackupOperationsService deleteBackup returns 404 for missing backups", async () => {
  const { service, deleteBackupCalls, auditLogs } = createBackupOperationsHarness();

  const result = await service.deleteBackup({
    backupId: "missing",
    username: "super.user",
  });

  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body, {
    message: "Backup not found",
  });
  assert.deepEqual(deleteBackupCalls, ["missing"]);
  assert.equal(auditLogs.length, 0);
});

test("BackupOperationsService deleteBackup audits successful deletes", async () => {
  const { service, deleteBackupCalls, auditLogs } = createBackupOperationsHarness();

  const result = await service.deleteBackup({
    backupId: "backup-1",
    username: "super.user",
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { success: true });
  assert.deepEqual(deleteBackupCalls, ["backup-1"]);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "DELETE_BACKUP");
  assert.equal(auditLogs[0].targetResource, "Nightly Backup");
});
