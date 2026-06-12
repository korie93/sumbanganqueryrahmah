import path from "node:path";
import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import type { Job, Queue } from "bullmq";
import { runtimeConfig } from "../config/runtime";
import type { PreparedMultipartImportUpload } from "../routes/imports-multipart-utils";
import type { ImportColumnMappingEntry } from "./import-column-mapping";

export type ImportBackgroundJobData = {
  readonly name: string;
  readonly filename: string;
  readonly stagedFilePath: string;
  readonly requestedBy: string;
  readonly contentHashSha256: string;
  readonly sourceSizeBytes: number;
  readonly columnMapping: ImportColumnMappingEntry[];
};

export type ImportBackgroundJobResult =
  | {
    status: "completed";
    importId: string;
    rowCount: number;
  }
  | {
    status: "cancelled";
  }
  | {
    status: "duplicate";
    importId: string;
    importName: string;
  };

export type ImportBackgroundJobSnapshot = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "duplicate";
  name: string;
  filename: string;
  progress: number;
  rowCount: number | null;
  importId: string | null;
  duplicateImportName: string | null;
  error: string | null;
  canCancel: boolean;
  canResume: boolean;
};

type ImportQueue = Queue<
  ImportBackgroundJobData,
  ImportBackgroundJobResult,
  "process-import"
>;

const IMPORT_JOB_DIRECTORY_NAME = "import-jobs";
const IMPORT_JOB_CANCEL_SUFFIX = ".cancel";

function getImportJobDirectory(): string {
  return path.resolve(runtimeConfig.app.uploadsRootDir, IMPORT_JOB_DIRECTORY_NAME);
}

export function assertImportJobStagedFilePath(stagedFilePath: string): string {
  const jobDirectory = getImportJobDirectory();
  const resolvedPath = path.resolve(stagedFilePath);
  const relativePath = path.relative(jobDirectory, resolvedPath);
  if (
    !relativePath
    || path.isAbsolute(relativePath)
    || relativePath.startsWith(`..${path.sep}`)
    || relativePath === ".."
    || path.extname(resolvedPath) !== ".upload"
  ) {
    throw new Error("Import job staged file path is outside managed storage.");
  }
  return resolvedPath;
}

export function getImportJobCancelMarkerPath(stagedFilePath: string): string {
  return `${assertImportJobStagedFilePath(stagedFilePath)}${IMPORT_JOB_CANCEL_SUFFIX}`;
}

export async function isImportJobCancellationRequested(stagedFilePath: string): Promise<boolean> {
  try {
    await access(getImportJobCancelMarkerPath(stagedFilePath));
    return true;
  } catch {
    return false;
  }
}

export async function cleanupImportBackgroundJobFiles(stagedFilePath: string): Promise<void> {
  const managedStagedFilePath = assertImportJobStagedFilePath(stagedFilePath);
  await Promise.allSettled([
    rm(managedStagedFilePath, { force: true }),
    rm(getImportJobCancelMarkerPath(managedStagedFilePath), { force: true }),
  ]);
}

async function moveUploadToImportJobStorage(
  upload: PreparedMultipartImportUpload,
): Promise<string> {
  const jobDirectory = getImportJobDirectory();
  await mkdir(jobDirectory, { recursive: true });
  const stagedFilePath = path.join(jobDirectory, `${randomUUID()}.upload`);

  try {
    await rename(upload.filePath, stagedFilePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EXDEV") {
      throw error;
    }
    await copyFile(upload.filePath, stagedFilePath);
    await rm(upload.filePath, { force: true });
  }

  await rm(upload.tempDir, { recursive: true, force: true });
  return stagedFilePath;
}

function readJobProgress(job: Job<ImportBackgroundJobData, ImportBackgroundJobResult>): number {
  const progress = typeof job.progress === "number"
    ? job.progress
    : Number((job.progress as Record<string, unknown> | null)?.percent ?? 0);
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
}

async function toSnapshot(
  job: Job<ImportBackgroundJobData, ImportBackgroundJobResult>,
): Promise<ImportBackgroundJobSnapshot> {
  const state = await job.getState();
  const result = job.returnvalue;
  const status = result?.status === "cancelled"
    ? "cancelled"
    : result?.status === "duplicate"
      ? "duplicate"
      : state === "active"
        ? "running"
        : state === "completed"
          ? "completed"
          : state === "failed"
            ? "failed"
            : "queued";

  return {
    id: String(job.id || ""),
    status,
    name: job.data.name,
    filename: job.data.filename,
    progress: status === "completed" || status === "duplicate" ? 100 : readJobProgress(job),
    rowCount: result?.status === "completed" ? result.rowCount : null,
    importId: result?.status === "completed" || result?.status === "duplicate"
      ? result.importId
      : null,
    duplicateImportName: result?.status === "duplicate" ? result.importName : null,
    error: status === "failed"
      ? "Import processing failed. Review the source file and try again."
      : null,
    canCancel: status === "queued" || status === "running",
    canResume: status === "cancelled" || status === "failed",
  };
}

export class ImportBackgroundJobService {
  constructor(private readonly getQueue: () => Queue | null) {}

  get configured(): boolean {
    return Boolean(this.getQueue());
  }

  async enqueue(params: {
    upload: PreparedMultipartImportUpload;
    name: string;
    requestedBy: string;
    columnMapping: ImportColumnMappingEntry[];
  }): Promise<ImportBackgroundJobSnapshot> {
    const queue = this.requireQueue();
    const stagedFilePath = await moveUploadToImportJobStorage(params.upload);

    try {
      const job = await queue.add(
        "process-import",
        {
          name: params.name,
          filename: params.upload.filename,
          stagedFilePath,
          requestedBy: params.requestedBy,
          contentHashSha256: params.upload.contentHashSha256,
          sourceSizeBytes: params.upload.sourceSizeBytes,
          columnMapping: params.columnMapping,
        },
        {
          attempts: 1,
          removeOnComplete: { age: 24 * 60 * 60, count: 200 },
          removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 },
        },
      ) as Job<ImportBackgroundJobData, ImportBackgroundJobResult>;
      return toSnapshot(job);
    } catch (error) {
      await cleanupImportBackgroundJobFiles(stagedFilePath);
      throw error;
    }
  }

  async getJob(jobId: string, requestedBy: string): Promise<ImportBackgroundJobSnapshot | null> {
    const job = await this.getOwnedJob(jobId, requestedBy);
    return job ? toSnapshot(job) : null;
  }

  async cancel(jobId: string, requestedBy: string): Promise<ImportBackgroundJobSnapshot | null> {
    const job = await this.getOwnedJob(jobId, requestedBy);
    if (!job) {
      return null;
    }
    const snapshot = await toSnapshot(job);
    if (snapshot.canCancel) {
      await writeFile(
        getImportJobCancelMarkerPath(job.data.stagedFilePath),
        "cancelled\n",
        { encoding: "utf8", flag: "w" },
      );
    }
    return toSnapshot(job);
  }

  async resume(jobId: string, requestedBy: string): Promise<ImportBackgroundJobSnapshot | null> {
    const queue = this.requireQueue();
    const job = await this.getOwnedJob(jobId, requestedBy);
    if (!job) {
      return null;
    }
    const snapshot = await toSnapshot(job);
    if (!snapshot.canResume) {
      return snapshot;
    }

    const stagedFilePath = assertImportJobStagedFilePath(job.data.stagedFilePath);
    await access(stagedFilePath);
    await rm(getImportJobCancelMarkerPath(stagedFilePath), { force: true });
    const resumedJob = await queue.add(
      "process-import",
      job.data,
      {
        attempts: 1,
        removeOnComplete: { age: 24 * 60 * 60, count: 200 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 },
      },
    ) as Job<ImportBackgroundJobData, ImportBackgroundJobResult>;
    return toSnapshot(resumedJob);
  }

  private requireQueue(): ImportQueue {
    const queue = this.getQueue();
    if (!queue) {
      throw new Error("Background import queue is not configured.");
    }
    return queue as ImportQueue;
  }

  private async getOwnedJob(
    jobId: string,
    requestedBy: string,
  ): Promise<Job<ImportBackgroundJobData, ImportBackgroundJobResult> | null> {
    const job = await this.requireQueue().getJob(jobId);
    if (!job || job.data.requestedBy !== requestedBy) {
      return null;
    }
    return job;
  }
}
