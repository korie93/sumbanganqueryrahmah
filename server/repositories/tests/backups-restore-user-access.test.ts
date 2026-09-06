import assert from "node:assert/strict";
import test from "node:test";
import { restoreUsersFromBackup } from "../backups-restore-core-datasets-utils";
import { createRestoreStats } from "../backups-restore-stats-utils";
import type { BackupUserRecord } from "../backups-repository-types";
import type { BackupPayloadChunkReader, BackupRestoreExecutor } from "../backups-restore-shared-utils";

function backupUser(overrides: Record<string, unknown> = {}): BackupUserRecord {
  return { id: "backup-owner:stable-text-id", username: "backup-owner", role: "admin", isBanned: false,
    passwordHash: "synthetic-hash-not-a-login-secret", ...overrides } as BackupUserRecord;
}

async function restoreUserRows(records: BackupUserRecord[], inserted: Record<string, unknown>[]) {
  const tx = {
    insert() {
      return {
        values(rows: Record<string, unknown>[]) {
          inserted.push(...rows);
          return { onConflictDoNothing() { return { async returning() { return rows.map((row) => ({ id: row.id })); } }; } };
        },
      };
    },
  } as unknown as BackupRestoreExecutor;
  const reader: BackupPayloadChunkReader = {
    async *iterateArrayChunks<T>(key: string) {
      assert.equal(key, "users");
      yield records as unknown as T[];
    },
  };
  return restoreUsersFromBackup(tx, reader, createRestoreStats());
}

test("user backup restore preserves stable identity, inactive status and password restrictions", async () => {
  for (const status of ["active", "pending_activation", "suspended", "disabled"]) {
    const inserted: Record<string, unknown>[] = [];
    await restoreUserRows([backupUser({ status, mustChangePassword: true, passwordResetBySuperuser: true })], inserted);
    assert.equal(inserted[0]?.id, "backup-owner:stable-text-id");
    assert.equal(inserted[0]?.status, status);
    assert.equal(inserted[0]?.mustChangePassword, true);
    assert.equal(inserted[0]?.passwordResetBySuperuser, true);
  }
});

test("user backup restore only applies access defaults to absent legacy fields", async () => {
  const inserted: Record<string, unknown>[] = [];
  await restoreUserRows([backupUser({ id: undefined })], inserted);
  assert.match(String(inserted[0]?.id), /^[0-9a-f-]{36}$/);
  assert.equal(inserted[0]?.status, "active");
  assert.equal(inserted[0]?.mustChangePassword, false);
  assert.equal(inserted[0]?.passwordResetBySuperuser, false);
});

test("user backup restore rejects malformed access status and restriction fields before writing", async () => {
  for (const status of [null, "", "ACTIVE", "disabled ", "unknown", 1, {}]) {
    const inserted: Record<string, unknown>[] = [];
    await assert.rejects(restoreUserRows([backupUser({ status })], inserted), /invalid account status/);
    assert.deepEqual(inserted, []);
  }
  for (const field of ["mustChangePassword", "passwordResetBySuperuser"]) {
    for (const value of [null, "true", "false", 1, 0, {}]) {
      const inserted: Record<string, unknown>[] = [];
      await assert.rejects(restoreUserRows([backupUser({ [field]: value })], inserted), /invalid password restriction/);
      assert.deepEqual(inserted, []);
    }
  }
});
