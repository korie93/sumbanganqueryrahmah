import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { BackupOperationsService } from "../backup-operations.service";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetResource?: string;
  details?: string;
};

function createBackupOperationsHarness(options?: {
  exportCircuitOpen?: boolean;
  corruptChecksum?: boolean;
  backupReadErrorMessage?: string;
  preparedPayloadEncrypted?: boolean;
  createBackupErrorMessage?: string;
  maxPayloadBytes?: number;
}) {
  const auditLogs: AuditEntry[] = [];
  const createBackupCalls: Array<Record<string, unknown>> = [];
  const restoreCalls: unknown[] = [];
  const deleteBackupCalls: string[] = [];
  const tempPayloadPaths: string[] = [];
  let payloadFileCleanupCount = 0;
  let readPreparedPayloadCallCount = 0;

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
          payloadChecksumSha256: options?.corruptChecksum
            ? "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
            : "27c7f1187bb22c1e832d2812300765fda4d9919427fb413b81f9884c763c2ff2",
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
    prepareBackupPayloadFileForCreate: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "backup-service-test-"));
      const tempFilePath = path.join(tempDir, "payload.json");
      tempPayloadPaths.push(tempFilePath);
      const payloadJson = JSON.stringify({
        imports: [{ id: "import-1" }],
        dataRows: [{ id: "row-1" }, { id: "row-2" }],
        users: [{ username: "super.user" }],
        auditLogs: [{ id: "audit-1" }],
        collectionRecords: [{ id: "record-1" }],
        collectionRecordReceipts: [{ id: "receipt-1" }],
      });

      if (options?.preparedPayloadEncrypted) {
        await fs.writeFile(tempFilePath, Buffer.from("encrypted-temp-payload", "utf8"));
      } else {
        await fs.writeFile(tempFilePath, payloadJson, "utf8");
      }

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
        maxSerializedRowBytes: Buffer.byteLength(payloadJson, "utf8"),
        memoryRssBytes: 2_048,
        memoryHeapUsedBytes: 1_024,
        tempPayloadEncrypted: Boolean(options?.preparedPayloadEncrypted),
        ...(options?.preparedPayloadEncrypted
          ? {
            tempPayloadStoragePrefix:
              "enc:v2:primary.iv-base64.auth-tag-base64.",
          }
          : {}),
        cleanup: async () => {
          payloadFileCleanupCount += 1;
          await fs.rm(tempDir, { recursive: true, force: true });
        },
      };
    },
    readPreparedBackupPayloadForStorage: async (preparedPayload: {
      tempFilePath: string;
      tempPayloadEncrypted: boolean;
      tempPayloadStoragePrefix?: string;
    }) => {
      readPreparedPayloadCallCount += 1;
      if (preparedPayload.tempPayloadEncrypted && typeof preparedPayload.tempPayloadStoragePrefix === "string") {
        const fileBuffer = await fs.readFile(preparedPayload.tempFilePath);
        return `${preparedPayload.tempPayloadStoragePrefix}${fileBuffer.toString("base64")}`;
      }
      return fs.readFile(preparedPayload.tempFilePath, "utf8");
    },
    createBackup: async (data: Record<string, unknown>) => {
      if (options?.createBackupErrorMessage) {
        throw new Error(options.createBackupErrorMessage);
      }
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
    getBackupById: async (id: string) => {
      if (options?.backupReadErrorMessage) {
        throw new Error(options.backupReadErrorMessage);
      }
      return backups.get(id);
    },
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
      options?.maxPayloadBytes == null
        ? undefined
        : {
          maxPayloadBytes: options.maxPayloadBytes,
        },
    ),
    auditLogs,
    createBackupCalls,
    restoreCalls,
    deleteBackupCalls,
    tempPayloadPaths,
    getPayloadFileCleanupCount: () => payloadFileCleanupCount,
    getReadPreparedPayloadCallCount: () => readPreparedPayloadCallCount,
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

test("BackupOperationsService listBackups returns paginated metadata", async () => {
  const { service } = createBackupOperationsHarness();

  const result = await service.listBackups({
    page: "1",
    pageSize: "25",
  });

  assert.equal(result.backups.length, 1);
  assert.deepEqual(result.pagination, {
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
  });
  assert.equal(result.backups[0].backupData, "");
});

test("BackupOperationsService createBackup persists backup metadata and audits export", async () => {
  const {
    service,
    createBackupCalls,
    auditLogs,
    getPayloadFileCleanupCount,
    tempPayloadPaths,
    getReadPreparedPayloadCallCount,
  } =
    createBackupOperationsHarness();

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
  assert.equal(typeof metadata.maxSerializedRowBytes, "number");
  assert.equal(typeof metadata.memoryRssBytes, "number");
  assert.equal(typeof metadata.memoryHeapUsedBytes, "number");
  assert.equal(getReadPreparedPayloadCallCount(), 1);
  assert.equal(getPayloadFileCleanupCount(), 1);
  await Promise.all(
    tempPayloadPaths.map(async (tempFilePath) => {
      await assert.rejects(() => fs.access(tempFilePath));
    }),
  );

  const auditDetails = JSON.parse(String(auditLogs[0].details));
  assert.equal(typeof auditDetails.durationMs, "number");
  assert.equal(typeof auditDetails.maxSerializedRowBytes, "number");
  assert.equal(typeof auditDetails.memoryRssBytes, "number");
  assert.equal(typeof auditDetails.memoryHeapUsedBytes, "number");
});

test("BackupOperationsService createBackup stores encrypted temp payloads without re-reading plaintext JSON", async () => {
  const {
    service,
    createBackupCalls,
    getPayloadFileCleanupCount,
    tempPayloadPaths,
    getReadPreparedPayloadCallCount,
  } =
    createBackupOperationsHarness({
      preparedPayloadEncrypted: true,
    });

  const result = await service.createBackup({
    name: "Encrypted Temp Backup",
    username: "super.user",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(createBackupCalls.length, 1);
  assert.match(String(createBackupCalls[0].backupData || ""), /^enc:v2:primary\./);
  assert.equal(
    String(createBackupCalls[0].backupData || "").includes("\"imports\""),
    false,
  );
  assert.equal(
    String(createBackupCalls[0].backupData || "").endsWith(
      Buffer.from("encrypted-temp-payload", "utf8").toString("base64"),
    ),
    true,
  );
  assert.equal(getReadPreparedPayloadCallCount(), 1);
  assert.equal(getPayloadFileCleanupCount(), 1);
  await Promise.all(
    tempPayloadPaths.map(async (tempFilePath) => {
      await assert.rejects(() => fs.access(tempFilePath));
    }),
  );
});

test("BackupOperationsService createBackup blocks oversized payloads before persisting them", async () => {
  const {
    service,
    createBackupCalls,
    auditLogs,
    getPayloadFileCleanupCount,
    tempPayloadPaths,
    getReadPreparedPayloadCallCount,
  } =
    createBackupOperationsHarness({
      maxPayloadBytes: 32,
    });

  const result = await service.createBackup({
    name: "Oversized Backup",
    username: "super.user",
  });

  assert.equal(result.statusCode, 413);
  assert.deepEqual(result.body, {
    message:
      "Backup payload exceeds the configured 32 bytes limit. Narrow the dataset or increase BACKUP_MAX_PAYLOAD_BYTES.",
  });
  assert.equal(createBackupCalls.length, 0);
  assert.equal(auditLogs.length, 0);
  assert.equal(getReadPreparedPayloadCallCount(), 0);
  assert.equal(getPayloadFileCleanupCount(), 1);
  await Promise.all(
    tempPayloadPaths.map(async (tempFilePath) => {
      await assert.rejects(() => fs.access(tempFilePath));
    }),
  );
});

test("BackupOperationsService createBackup cleans up temp payload files when storage persistence fails", async () => {
  const { service, getPayloadFileCleanupCount, tempPayloadPaths } = createBackupOperationsHarness({
    createBackupErrorMessage: "backup insert failed",
  });

  await assert.rejects(
    () =>
      service.createBackup({
        name: "Manual Backup",
        username: "super.user",
      }),
    /backup insert failed/i,
  );

  assert.equal(getPayloadFileCleanupCount(), 1);
  await Promise.all(
    tempPayloadPaths.map(async (tempFilePath) => {
      await assert.rejects(() => fs.access(tempFilePath));
    }),
  );
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

test("BackupOperationsService getBackupMetadata returns metadata-only payload and audits access", async () => {
  const { service, auditLogs } = createBackupOperationsHarness();

  const result = await service.getBackupMetadata("backup-1", "super.user");

  assert.equal(result.statusCode, 200);
  assert.equal((result.body as any).id, "backup-1");
  assert.equal((result.body as any).backupData, "");
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "VIEW_BACKUP_METADATA");
});

test("BackupOperationsService exportBackup returns downloadable payload and audits export", async () => {
  const { service, auditLogs } = createBackupOperationsHarness();

  const result = await service.exportBackup("backup-1", "super.user");

  assert.equal(result.statusCode, 200);
  assert.equal(typeof (result.body as any).fileName, "string");
  const payload = JSON.parse(
    `${String((result.body as any).payloadPrefixJson || "")}${String((result.body as any).backupDataJson || "")}${String((result.body as any).payloadSuffixJson || "")}`,
  );
  assert.equal(payload.id, "backup-1");
  assert.equal(Array.isArray(payload.backupData.imports), true);
  assert.equal(payload.integrity.verified, true);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "DOWNLOAD_BACKUP_EXPORT");
});

test("BackupOperationsService exportBackup blocks corrupted backup payload checksum", async () => {
  const { service, auditLogs } = createBackupOperationsHarness({
    corruptChecksum: true,
  });

  const result = await service.exportBackup("backup-1", "super.user");

  assert.equal(result.statusCode, 409);
  assert.deepEqual(result.body, {
    message: "Backup integrity check failed. Export cancelled.",
  });
  assert.equal(auditLogs.length, 0);
});

test("BackupOperationsService exportBackup returns 409 when backup payload cannot be decrypted", async () => {
  const { service, auditLogs } = createBackupOperationsHarness({
    backupReadErrorMessage:
      "Missing backup encryption key 'primary'. Configure BACKUP_ENCRYPTION_KEYS for key rotation support.",
  });

  const result = await service.exportBackup("backup-1", "super.user");

  assert.equal(result.statusCode, 409);
  assert.deepEqual(result.body, {
    message:
      "Backup payload cannot be decrypted with the current encryption configuration.",
  });
  assert.equal(auditLogs.length, 0);
});

test("BackupOperationsService exportBackup blocks oversized payloads", async () => {
  const { service, auditLogs } = createBackupOperationsHarness({
    maxPayloadBytes: 32,
  });

  const result = await service.exportBackup("backup-1", "super.user");

  assert.equal(result.statusCode, 413);
  assert.deepEqual(result.body, {
    message:
      "Backup payload exceeds the configured 32 bytes limit. Narrow the dataset or increase BACKUP_MAX_PAYLOAD_BYTES.",
  });
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
  assert.equal((result.body as any).integrity.verified, true);
  assert.equal(restoreCalls.length, 1);
  assert.equal(typeof restoreCalls[0], "string");
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "RESTORE_BACKUP");
  assert.equal(auditLogs[0].targetResource, "Nightly Backup");

  const auditDetails = JSON.parse(String(auditLogs[0].details));
  assert.equal(auditDetails.totalProcessed, 3);
  assert.equal(auditDetails.totalInserted, 3);
  assert.equal(auditDetails.warningCount, 0);
  assert.equal(typeof auditDetails.durationMs, "number");
});

test("BackupOperationsService restoreBackup blocks corrupted backup payload checksum", async () => {
  const { service, restoreCalls, auditLogs } = createBackupOperationsHarness({
    corruptChecksum: true,
  });

  const result = await service.restoreBackup({
    backupId: "backup-1",
    username: "super.user",
  });

  assert.equal(result.statusCode, 409);
  assert.deepEqual(result.body, {
    message: "Backup integrity check failed. Restore cancelled.",
  });
  assert.equal(restoreCalls.length, 0);
  assert.equal(auditLogs.length, 0);
});

test("BackupOperationsService restoreBackup returns 409 when backup payload cannot be decrypted", async () => {
  const { service, restoreCalls, auditLogs } = createBackupOperationsHarness({
    backupReadErrorMessage:
      "Unable to decrypt legacy encrypted backup payload with configured backup encryption keys.",
  });

  const result = await service.restoreBackup({
    backupId: "backup-1",
    username: "super.user",
  });

  assert.equal(result.statusCode, 409);
  assert.deepEqual(result.body, {
    message:
      "Backup payload cannot be decrypted with the current encryption configuration.",
  });
  assert.equal(restoreCalls.length, 0);
  assert.equal(auditLogs.length, 0);
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

test("BackupOperationsService deleteBackup still succeeds when full payload read is unavailable", async () => {
  const { service, deleteBackupCalls, auditLogs } = createBackupOperationsHarness({
    backupReadErrorMessage:
      "Missing backup encryption key 'primary'. Configure BACKUP_ENCRYPTION_KEYS for key rotation support.",
  });

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
