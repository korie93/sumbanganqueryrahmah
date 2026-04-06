import assert from "node:assert/strict";
import test from "node:test";
import {
  createBackupDownloadFileName,
  getBackupPayloadReadErrorResponse,
  verifyBackupIntegrity,
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

test("createBackupDownloadFileName sanitizes unsafe backup names", () => {
  assert.equal(
    createBackupDownloadFileName("April Backup / Ops", "backup-1"),
    "April_Backup_Ops-backup-1.json",
  );
});
