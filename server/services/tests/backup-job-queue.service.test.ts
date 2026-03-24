import assert from "node:assert/strict";
import test from "node:test";
import { BackupJobQueueService } from "../backup-job-queue.service";
import { createInMemoryBackupJobRepository } from "../../test-support/backup-job-queue-test-double";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitForJob(
  queue: BackupJobQueueService,
  jobId: string,
  expectedStatuses: Array<"queued" | "running" | "completed" | "failed">,
) {
  const deadline = Date.now() + 2000;

  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId);
    if (job && expectedStatuses.includes(job.status)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail(`Backup job ${jobId} did not reach ${expectedStatuses.join(" or ")} before timeout.`);
}

test("BackupJobQueueService runs one backup job at a time and completes queued work", async () => {
  const repository = createInMemoryBackupJobRepository();
  const first = createDeferred<{ statusCode: number; body: unknown }>();
  const second = createDeferred<{ statusCode: number; body: unknown }>();
  let createCallCount = 0;
  let restoreCallCount = 0;

  const queue = new BackupJobQueueService({
    repository,
    executeCreate: async () => {
      createCallCount += 1;
      return first.promise;
    },
    executeRestore: async () => {
      restoreCallCount += 1;
      return second.promise;
    },
  });

  const firstJob = await queue.enqueue({
    type: "create",
    requestedBy: "super.user",
    backupName: "First Backup",
  });
  const secondJob = await queue.enqueue({
    type: "restore",
    requestedBy: "super.user",
    backupId: "backup-1",
  });

  const runningJob = await queue.getJob(firstJob.id);
  const queuedJob = await queue.getJob(secondJob.id);
  assert.equal(runningJob?.status, "running");
  assert.equal(queuedJob?.status, "queued");
  assert.equal(queuedJob?.queuePosition, 1);

  first.resolve({
    statusCode: 200,
    body: { id: "backup-2", name: "First Backup" },
  });

  const secondRunning = await waitForJob(queue, secondJob.id, ["running"]);
  assert.equal(secondRunning.status, "running");

  second.resolve({
    statusCode: 200,
    body: { backupId: "backup-1", backupName: "Nightly Backup", success: true },
  });

  const completedFirst = await waitForJob(queue, firstJob.id, ["completed"]);
  const completedSecond = await waitForJob(queue, secondJob.id, ["completed"]);
  assert.equal(completedFirst.status, "completed");
  assert.equal(completedFirst.backupId, "backup-2");
  assert.equal(completedSecond.status, "completed");
  assert.equal(completedSecond.backupName, "Nightly Backup");
  assert.equal(createCallCount, 1);
  assert.equal(restoreCallCount, 1);
});

test("BackupJobQueueService stores failure state for non-success responses and thrown errors", async () => {
  const repository = createInMemoryBackupJobRepository();
  let createCallCount = 0;
  let restoreCallCount = 0;
  const queue = new BackupJobQueueService({
    repository,
    executeCreate: async () => {
      createCallCount += 1;
      return {
        statusCode: 409,
        body: { message: "Backup integrity check failed." },
      };
    },
    executeRestore: async () => {
      restoreCallCount += 1;
      throw new Error("Restore exploded");
    },
  });

  const failedResponseJob = await queue.enqueue({
    type: "create",
    requestedBy: "super.user",
    backupName: "Bad Backup",
  });
  const thrownErrorJob = await queue.enqueue({
    type: "restore",
    requestedBy: "super.user",
    backupId: "backup-9",
  });

  const failedResponseResult = await waitForJob(queue, failedResponseJob.id, ["failed"]);
  const thrownErrorResult = await waitForJob(queue, thrownErrorJob.id, ["failed"]);

  assert.equal(failedResponseResult.error?.message, "Backup integrity check failed.");
  assert.equal(thrownErrorResult.error?.message, "Restore exploded");
  assert.equal(createCallCount, 1);
  assert.equal(restoreCallCount, 1);
});

test("BackupJobQueueService marks interrupted running jobs as failed and resumes queued work on restart", async () => {
  const repository = createInMemoryBackupJobRepository();
  const stuckCreate = createDeferred<{ statusCode: number; body: unknown }>();
  let restoreCallCount = 0;

  const firstQueue = new BackupJobQueueService({
    repository,
    executeCreate: async () => stuckCreate.promise,
    executeRestore: async () => ({
      statusCode: 200,
      body: { backupId: "backup-1", backupName: "Nightly Backup", success: true },
    }),
  });

  const runningJob = await firstQueue.enqueue({
    type: "create",
    requestedBy: "super.user",
    backupName: "Interrupted Backup",
  });
  const queuedJob = await firstQueue.enqueue({
    type: "restore",
    requestedBy: "super.user",
    backupId: "backup-1",
  });

  const restartedQueue = new BackupJobQueueService({
    repository,
    executeCreate: async () => ({
      statusCode: 200,
      body: { id: "backup-ignored", name: "Should not rerun" },
    }),
    executeRestore: async () => {
      restoreCallCount += 1;
      return {
        statusCode: 200,
        body: { backupId: "backup-1", backupName: "Nightly Backup", success: true },
      };
    },
  });

  await restartedQueue.start();

  const interruptedResult = await waitForJob(restartedQueue, runningJob.id, ["failed"]);
  const resumedQueuedResult = await waitForJob(restartedQueue, queuedJob.id, ["completed"]);

  assert.equal(
    interruptedResult.error?.message,
    "Backup job was interrupted by a server restart before completion.",
  );
  assert.equal(resumedQueuedResult.status, "completed");
  assert.equal(restoreCallCount, 1);
});
