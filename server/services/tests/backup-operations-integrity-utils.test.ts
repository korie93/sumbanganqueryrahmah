import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBackupMetadata,
  computePayloadChecksum,
  createBackupDownloadFileName,
  getBackupPayloadReadErrorResponse,
  verifyBackupIntegrity,
  verifyBackupIntegrityFromChunks,
} from "../backup-operations-integrity-utils";

test("verifyBackupIntegrity treats backups without a stored checksum as readable but unverified", () => {
  const result = verifyBackupIntegrity({
    id: "backup-1",
    name: "Nightly Backup",
    createdAt: "2026-03-20T00:00:00.000Z",
    createdBy: "super.user",
    backupData: "{\"imports\":[]}",
    metadata: {},
  } as any);

  assert.equal(result.ok, true);
  assert.equal(result.verified, false);
  assert.equal(result.storedChecksum, null);
  assert.equal(typeof result.computedChecksum, "string");
  assert.equal(result.computedChecksum.length, 64);
});

test("getBackupPayloadReadErrorResponse returns a conflict response for encrypted payload failures", () => {
  const result = getBackupPayloadReadErrorResponse(
    new Error("Backup payload cannot be decrypted with BACKUP_ENCRYPTION_KEY."),
  );

  assert.deepEqual(result, {
    statusCode: 409,
    body: {
      message: "Backup payload cannot be decrypted with the current encryption configuration.",
    },
  });
});

test("verifyBackupIntegrityFromChunks verifies checksum and payload size without a full payload string", async () => {
  const payloadJson = "{\"imports\":[]}";
  const result = await verifyBackupIntegrityFromChunks(
    {
      metadata: {
        payloadChecksumSha256: computePayloadChecksum(payloadJson),
      },
    },
    (async function* () {
      yield "{\"imports\":";
      yield "[]}";
    })(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.payloadBytes, Buffer.byteLength(payloadJson, "utf8"));
  assert.equal(result.computedChecksum, computePayloadChecksum(payloadJson));
});

test("createBackupDownloadFileName sanitizes unsafe backup names", () => {
  assert.equal(
    createBackupDownloadFileName("April Backup / Ops", "backup-1"),
    "April_Backup_Ops-backup-1.json",
  );
});

test("buildBackupMetadata includes payload size and temp encryption flags", () => {
  const metadata = buildBackupMetadata(
    {
      counts: {
        importsCount: 1,
        dataRowsCount: 2,
        usersCount: 3,
        auditLogsCount: 4,
        collectionRecordsCount: 5,
        collectionRecordReceiptsCount: 6,
      },
      payloadBytes: 1024,
      maxSerializedRowBytes: 256,
      memoryRssBytes: 2_048,
      memoryHeapUsedBytes: 1_024,
      tempPayloadEncrypted: true,
    },
    "a".repeat(64),
  );

  assert.equal(metadata.payloadBytes, 1024);
  assert.equal(metadata.maxSerializedRowBytes, 256);
  assert.equal(metadata.memoryRssBytes, 2_048);
  assert.equal(metadata.memoryHeapUsedBytes, 1_024);
  assert.equal(metadata.tempPayloadEncrypted, true);
  assert.equal(metadata.collectionRecordReceiptsCount, 6);
});
