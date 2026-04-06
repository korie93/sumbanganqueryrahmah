import assert from "node:assert/strict";
import test from "node:test";
import type { BackupJobRecord } from "../../repositories/backup-job.repository";
import { executeQueuedBackupJob } from "../backup-job-queue-execution-utils";

function buildJob(overrides?: Partial<BackupJobRecord>): BackupJobRecord {
  return {
    id: "job-1",
    type: "restore",
    status: "running",
    requestedBy: "super.user",
    requestedAt: new Date("2026-03-20T00:00:00.000Z"),
    startedAt: new Date("2026-03-20T00:00:05.000Z"),
    finishedAt: null,
    updatedAt: new Date("2026-03-20T00:00:05.000Z"),
    backupId: "backup-1",
    backupName: "Nightly Backup",
    result: null,
    error: null,
    ...overrides,
  };
}

test("executeQueuedBackupJob fails restore jobs that are missing a backup id", async () => {
  const failCalls: Array<Record<string, unknown>> = [];

  await executeQueuedBackupJob(
    {
      repository: {
        createJob: async () => {
          throw new Error("unused");
        },
        getJobSnapshot: async () => null,
        claimNextQueuedJob: async () => null,
        completeJob: async () => {
          throw new Error("should not complete");
        },
        failJob: async (params) => {
          failCalls.push(params);
        },
        markRunningJobsFailed: async () => undefined,
        pruneHistory: async () => undefined,
      },
      executeCreate: async () => ({
        statusCode: 200,
        body: { id: "backup-new", name: "Created Backup" },
      }),
      executeRestore: async () => ({
        statusCode: 200,
        body: { backupId: "backup-1", backupName: "Nightly Backup", success: true },
      }),
    },
    buildJob({ backupId: null }),
  );

  assert.equal(failCalls.length, 1);
  assert.deepEqual(failCalls[0], {
    jobId: "job-1",
    error: {
      statusCode: 400,
      message: "Backup restore job is missing the backup id.",
    },
  });
});

test("executeQueuedBackupJob stores backup identity from successful create results", async () => {
  const completeCalls: Array<Record<string, unknown>> = [];

  await executeQueuedBackupJob(
    {
      repository: {
        createJob: async () => {
          throw new Error("unused");
        },
        getJobSnapshot: async () => null,
        claimNextQueuedJob: async () => null,
        completeJob: async (params) => {
          completeCalls.push(params);
        },
        failJob: async () => {
          throw new Error("should not fail");
        },
        markRunningJobsFailed: async () => undefined,
        pruneHistory: async () => undefined,
      },
      executeCreate: async () => ({
        statusCode: 200,
        body: { id: "backup-2", name: "Created Backup" },
      }),
      executeRestore: async () => ({
        statusCode: 200,
        body: { backupId: "backup-1", backupName: "Nightly Backup", success: true },
      }),
    },
    buildJob({
      type: "create",
      backupId: null,
      backupName: "Requested Name",
    }),
  );

  assert.equal(completeCalls.length, 1);
  assert.deepEqual(completeCalls[0], {
    jobId: "job-1",
    result: { id: "backup-2", name: "Created Backup" },
    backupId: "backup-2",
    backupName: "Created Backup",
  });
});
