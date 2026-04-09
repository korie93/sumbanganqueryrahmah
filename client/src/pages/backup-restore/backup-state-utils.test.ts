import assert from "node:assert/strict";
import test from "node:test";
import type { BackupJobRecord } from "@/pages/backup-restore/types";

import {
  buildBackupQueryParams,
  buildRestoreSuccessSummary,
  getBackupPaginationFallback,
  hasActiveBackupFilters,
  isBackupJobInProgress,
  isBackupJobTerminal,
} from "@/pages/backup-restore/backup-state-utils";

function createBackupJob(status: BackupJobRecord["status"]): BackupJobRecord {
  return {
    id: "job-1",
    type: "create",
    status,
    requestedBy: "super.user",
    requestedAt: "2026-04-01T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    backupId: null,
    backupName: null,
    queuePosition: 1,
    result: null,
    error: null,
  };
}

test("buildBackupQueryParams normalizes empty filters for API requests", () => {
  assert.deepEqual(
    buildBackupQueryParams({
      page: 2,
      pageSize: 25,
      deferredSearchName: "",
      createdByFilter: "  ",
      sortBy: "newest",
      dateRange: { from: null, to: null },
    }),
    {
      page: 2,
      pageSize: 25,
      searchName: undefined,
      createdBy: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      sortBy: "newest",
    },
  );
});

test("backup pagination and filter helpers derive stable defaults", () => {
  const backups = [{ id: "b1", name: "Nightly", createdAt: "2026-04-01T00:00:00.000Z", createdBy: "system", metadata: null }];

  assert.deepEqual(getBackupPaginationFallback(1, 20, backups), {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  });

  assert.equal(
    hasActiveBackupFilters({
      createdByFilter: "",
      dateFrom: "",
      datePreset: "all",
      dateTo: "",
      searchName: "",
      sortBy: "newest",
    }),
    false,
  );
});

test("backup job helpers identify in-progress and terminal states", () => {
  assert.equal(isBackupJobInProgress(null, "job-1"), true);
  assert.equal(isBackupJobInProgress(createBackupJob("running"), "job-1"), true);
  assert.equal(isBackupJobInProgress(createBackupJob("completed"), "job-1"), false);
  assert.equal(isBackupJobTerminal("completed"), true);
  assert.equal(isBackupJobTerminal("failed"), true);
  assert.equal(isBackupJobTerminal("running"), false);
});

test("buildRestoreSuccessSummary reports restored entity counts and duration", () => {
  const summary = buildRestoreSuccessSummary({
    success: true,
    message: "done",
    durationMs: 2450,
    stats: {
      imports: { processed: 1, inserted: 1, skipped: 0, reactivated: 0 },
      dataRows: { processed: 2, inserted: 2, skipped: 0, reactivated: 0 },
      users: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
      auditLogs: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
      collectionRecords: { processed: 3, inserted: 1, skipped: 2, reactivated: 0 },
      collectionRecordReceipts: { processed: 0, inserted: 0, skipped: 0, reactivated: 0 },
      warnings: [],
      totalProcessed: 6,
      totalInserted: 4,
      totalSkipped: 2,
      totalReactivated: 0,
    },
  });

  assert.equal(summary.title, "Restore Successful");
  assert.match(summary.description, /1 imports/);
  assert.match(summary.description, /2 data rows/);
  assert.match(summary.description, /1 collection records/);
  assert.match(summary.description, /2\.5s/);
});
