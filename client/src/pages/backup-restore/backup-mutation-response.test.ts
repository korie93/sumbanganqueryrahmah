import assert from "node:assert/strict";
import test from "node:test";
import { resolveBackupMutationResponse } from "@/pages/backup-restore/backup-mutation-response";

test("resolveBackupMutationResponse keeps queued job responses stable", () => {
  const resolved = resolveBackupMutationResponse(
    {
      message: "Backup creation queued.",
      job: {
        id: "job-1",
        type: "create",
        status: "queued",
        requestedBy: "super.user",
        requestedAt: "2026-03-25T00:00:00.000Z",
        startedAt: null,
        finishedAt: null,
        backupId: null,
        backupName: "Nightly Backup",
        queuePosition: 0,
        result: null,
        error: null,
      },
    },
    "Backup queued.",
  );

  assert.equal(resolved.mode, "queued");
  assert.equal(resolved.job.id, "job-1");
  assert.equal(resolved.job.backupName, "Nightly Backup");
});

test("resolveBackupMutationResponse accepts direct completed backup payloads", () => {
  const resolved = resolveBackupMutationResponse(
    {
      id: "backup-2",
      name: "Manual Backup",
    },
    "Backup created.",
  );

  assert.deepEqual(resolved, {
    mode: "completed",
    message: "Backup created.",
    backupId: "backup-2",
    backupName: "Manual Backup",
    restoreResult: null,
  });
});

test("resolveBackupMutationResponse accepts completed restore payloads", () => {
  const resolved = resolveBackupMutationResponse(
    {
      success: true,
      message: "Restore completed.",
      backupId: "backup-1",
      backupName: "Nightly Backup",
      stats: {
        imports: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
        dataRows: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
        users: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
        auditLogs: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
        collectionRecords: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
        collectionRecordReceipts: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
        warnings: [],
        totalProcessed: 0,
        totalInserted: 0,
        totalSkipped: 0,
        totalReactivated: 0,
      },
    },
    "Restore completed.",
  );

  assert.equal(resolved.mode, "completed");
  assert.equal(resolved.backupId, "backup-1");
  assert.equal(resolved.backupName, "Nightly Backup");
  assert.equal(resolved.restoreResult?.success, true);
});

test("resolveBackupMutationResponse rejects invalid payloads with a clear error", () => {
  assert.throws(
    () => resolveBackupMutationResponse({ ok: true }, "Backup queued."),
    /did not include queued job details or completion details/i,
  );
});
