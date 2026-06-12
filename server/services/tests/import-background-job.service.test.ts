import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Job, Queue } from "bullmq";
import { runtimeConfig } from "../../config/runtime";
import {
  assertImportJobStagedFilePath,
  cleanupImportBackgroundJobFiles,
  getImportJobCancelMarkerPath,
  ImportBackgroundJobService,
  type ImportBackgroundJobData,
  type ImportBackgroundJobResult,
} from "../import-background-job.service";

type MutableTestJob = Job<ImportBackgroundJobData, ImportBackgroundJobResult> & {
  failedReason: string;
  returnvalue: ImportBackgroundJobResult | null;
  testState: "waiting" | "active" | "completed" | "failed";
};

function createQueueHarness() {
  const jobs = new Map<string, MutableTestJob>();
  let sequence = 0;
  const queue = {
    add: async (
      name: "process-import",
      data: ImportBackgroundJobData,
    ) => {
      sequence += 1;
      const job = {
        id: `job-${sequence}`,
        name,
        data,
        progress: 0,
        returnvalue: null,
        failedReason: "",
        testState: "waiting",
        getState: async () => job.testState,
      } as unknown as MutableTestJob;
      jobs.set(String(job.id), job);
      return job;
    },
    getJob: async (jobId: string) => jobs.get(jobId) ?? null,
  } as unknown as Queue;

  return { jobs, queue };
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

test("background import jobs stage files, enforce ownership, cancel, and resume", async () => {
  const originalUploadsRootDir = runtimeConfig.app.uploadsRootDir;
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sqr-background-import-"));
  const sourceDir = path.join(rootDir, "source");
  const sourcePath = path.join(sourceDir, "source.upload");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(sourcePath, "name\nAlice\n", "utf8");
  runtimeConfig.app.uploadsRootDir = path.join(rootDir, "managed");
  const { jobs, queue } = createQueueHarness();
  const service = new ImportBackgroundJobService(() => queue);

  try {
    const queued = await service.enqueue({
      upload: {
        kind: "staged-file",
        filename: "customers.csv",
        filePath: sourcePath,
        tempDir: sourceDir,
        contentHashSha256: "a".repeat(64),
        sourceSizeBytes: 11,
      },
      name: "Customers",
      requestedBy: "admin.user",
      columnMapping: [{ source: "name", target: "customer_name" }],
    });

    assert.equal(queued.status, "queued");
    assert.equal(await exists(sourcePath), false);
    assert.throws(
      () => assertImportJobStagedFilePath(path.join(rootDir, "outside.upload")),
      /outside managed storage/i,
    );
    const queuedJob = jobs.get(queued.id);
    assert.ok(queuedJob);
    assert.equal(await exists(queuedJob.data.stagedFilePath), true);
    assert.equal(await service.getJob(queued.id, "another.user"), null);

    const cancelRequested = await service.cancel(queued.id, "admin.user");
    assert.equal(cancelRequested?.canCancel, true);
    assert.equal(
      await exists(getImportJobCancelMarkerPath(queuedJob.data.stagedFilePath)),
      true,
    );

    queuedJob.returnvalue = { status: "cancelled" };
    queuedJob.testState = "completed";
    const cancelled = await service.getJob(queued.id, "admin.user");
    assert.equal(cancelled?.status, "cancelled");
    assert.equal(cancelled?.canResume, true);

    const resumed = await service.resume(queued.id, "admin.user");
    assert.equal(resumed?.status, "queued");
    assert.notEqual(resumed?.id, queued.id);
    assert.equal(
      await exists(getImportJobCancelMarkerPath(queuedJob.data.stagedFilePath)),
      false,
    );

    const resumedJob = jobs.get(String(resumed?.id));
    assert.ok(resumedJob);
    resumedJob.testState = "failed";
    resumedJob.failedReason = "SELECT password FROM users at C:\\internal\\database.ts";
    const failed = await service.getJob(String(resumed?.id), "admin.user");
    assert.equal(
      failed?.error,
      "Import processing failed. Review the source file and try again.",
    );
    assert.equal(failed?.error?.includes("SELECT"), false);
    assert.equal(failed?.canResume, true);

    await cleanupImportBackgroundJobFiles(queuedJob.data.stagedFilePath);
  } finally {
    runtimeConfig.app.uploadsRootDir = originalUploadsRootDir;
    await rm(rootDir, { recursive: true, force: true });
  }
});
