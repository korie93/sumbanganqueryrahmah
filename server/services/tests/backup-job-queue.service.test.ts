import assert from "node:assert/strict";
import test from "node:test";
import { BackupJobQueueService } from "../backup-job-queue.service";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("BackupJobQueueService runs one backup job at a time and completes queued work", async () => {
  const queue = new BackupJobQueueService();
  const first = createDeferred<{ statusCode: number; body: unknown }>();
  const second = createDeferred<{ statusCode: number; body: unknown }>();

  const firstJob = queue.enqueue({
    type: "create",
    requestedBy: "super.user",
    backupName: "First Backup",
    execute: () => first.promise,
  });
  const secondJob = queue.enqueue({
    type: "restore",
    requestedBy: "super.user",
    backupId: "backup-1",
    execute: () => second.promise,
  });

  const runningJob = queue.getJob(firstJob.id);
  const queuedJob = queue.getJob(secondJob.id);
  assert.equal(runningJob?.status, "running");
  assert.equal(queuedJob?.status, "queued");
  assert.equal(queuedJob?.queuePosition, 1);

  first.resolve({
    statusCode: 200,
    body: { id: "backup-2", name: "First Backup" },
  });
  await Promise.resolve();
  await Promise.resolve();

  const secondRunning = queue.getJob(secondJob.id);
  assert.equal(secondRunning?.status, "running");

  second.resolve({
    statusCode: 200,
    body: { backupId: "backup-1", backupName: "Nightly Backup", success: true },
  });
  await Promise.resolve();
  await Promise.resolve();

  const completedFirst = queue.getJob(firstJob.id);
  const completedSecond = queue.getJob(secondJob.id);
  assert.equal(completedFirst?.status, "completed");
  assert.equal(completedFirst?.backupId, "backup-2");
  assert.equal(completedSecond?.status, "completed");
  assert.equal(completedSecond?.backupName, "Nightly Backup");
});

test("BackupJobQueueService stores failure state for non-success responses and thrown errors", async () => {
  const queue = new BackupJobQueueService();

  const failedResponseJob = queue.enqueue({
    type: "create",
    requestedBy: "super.user",
    backupName: "Bad Backup",
    execute: async () => ({
      statusCode: 409,
      body: { message: "Backup integrity check failed." },
    }),
  });
  const thrownErrorJob = queue.enqueue({
    type: "restore",
    requestedBy: "super.user",
    backupId: "backup-9",
    execute: async () => {
      throw new Error("Restore exploded");
    },
  });

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(queue.getJob(failedResponseJob.id)?.status, "failed");
  assert.equal(queue.getJob(failedResponseJob.id)?.error?.message, "Backup integrity check failed.");
  assert.equal(queue.getJob(thrownErrorJob.id)?.status, "failed");
  assert.equal(queue.getJob(thrownErrorJob.id)?.error?.message, "Restore exploded");
});
