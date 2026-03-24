import crypto from "crypto";
import { logger } from "../lib/logger";

type BackupJobType = "create" | "restore";
type BackupJobStatus = "queued" | "running" | "completed" | "failed";

type BackupJobError = {
  message: string;
  statusCode: number;
};

type BackupJobOperationResponse = {
  statusCode: number;
  body: unknown;
};

type StoredBackupJob = {
  id: string;
  type: BackupJobType;
  status: BackupJobStatus;
  requestedBy: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  backupId: string | null;
  backupName: string | null;
  result: unknown;
  error: BackupJobError | null;
};

type EnqueueBackupJobInput = {
  type: BackupJobType;
  requestedBy: string;
  backupId?: string | null;
  backupName?: string | null;
  execute: () => Promise<BackupJobOperationResponse>;
};

export type BackupJobSnapshot = {
  id: string;
  type: BackupJobType;
  status: BackupJobStatus;
  requestedBy: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  backupId: string | null;
  backupName: string | null;
  queuePosition: number;
  result: unknown;
  error: BackupJobError | null;
};

export class BackupJobQueueService {
  private readonly jobs = new Map<string, StoredBackupJob>();
  private readonly queue: Array<{
    jobId: string;
    execute: () => Promise<BackupJobOperationResponse>;
  }> = [];
  private activeJobId: string | null = null;

  constructor(private readonly maxRetainedJobs = 25) {}

  enqueue(input: EnqueueBackupJobInput): BackupJobSnapshot {
    const jobId = crypto.randomUUID();
    const job: StoredBackupJob = {
      id: jobId,
      type: input.type,
      status: "queued",
      requestedBy: input.requestedBy,
      requestedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      backupId: input.backupId ?? null,
      backupName: input.backupName ?? null,
      result: null,
      error: null,
    };

    this.jobs.set(jobId, job);
    this.queue.push({
      jobId,
      execute: input.execute,
    });
    void this.runNext();
    return this.toSnapshot(job);
  }

  getJob(jobId: string): BackupJobSnapshot | null {
    const job = this.jobs.get(jobId);
    return job ? this.toSnapshot(job) : null;
  }

  private async runNext() {
    if (this.activeJobId || this.queue.length === 0) {
      return;
    }

    const nextJob = this.queue.shift();
    if (!nextJob) {
      return;
    }

    const job = this.jobs.get(nextJob.jobId);
    if (!job) {
      void this.runNext();
      return;
    }

    this.activeJobId = job.id;
    job.status = "running";
    job.startedAt = new Date().toISOString();

    try {
      const response = await nextJob.execute();
      if (response.statusCode >= 400) {
        job.status = "failed";
        job.error = {
          statusCode: response.statusCode,
          message: this.readFailureMessage(response.body),
        };
        job.result = null;
      } else {
        job.status = "completed";
        job.error = null;
        job.result = response.body;
        this.updateBackupIdentity(job, response.body);
      }
    } catch (error) {
      job.status = "failed";
      job.result = null;
      job.error = {
        statusCode: 500,
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unexpected backup job failure.",
      };
      logger.error("Backup background job failed", {
        jobId: job.id,
        type: job.type,
        error,
      });
    } finally {
      job.finishedAt = new Date().toISOString();
      this.activeJobId = null;
      this.pruneHistory();
      void this.runNext();
    }
  }

  private updateBackupIdentity(job: StoredBackupJob, result: unknown) {
    if (!result || typeof result !== "object") {
      return;
    }

    const resultRecord = result as Record<string, unknown>;
    const backupId = String(resultRecord.backupId ?? resultRecord.id ?? "").trim();
    const backupName = String(resultRecord.backupName ?? resultRecord.name ?? "").trim();
    if (backupId) {
      job.backupId = backupId;
    }
    if (backupName) {
      job.backupName = backupName;
    }
  }

  private readFailureMessage(body: unknown) {
    if (body && typeof body === "object") {
      const message = String((body as Record<string, unknown>).message ?? "").trim();
      if (message) {
        return message;
      }
    }
    return "Backup job failed.";
  }

  private pruneHistory() {
    if (this.jobs.size <= this.maxRetainedJobs) {
      return;
    }

    const removableJobs = Array.from(this.jobs.values())
      .filter((job) => job.status === "completed" || job.status === "failed")
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));

    while (this.jobs.size > this.maxRetainedJobs && removableJobs.length > 0) {
      const job = removableJobs.shift();
      if (!job) {
        break;
      }
      this.jobs.delete(job.id);
    }
  }

  private toSnapshot(job: StoredBackupJob): BackupJobSnapshot {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      requestedBy: job.requestedBy,
      requestedAt: job.requestedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      backupId: job.backupId,
      backupName: job.backupName,
      queuePosition: this.readQueuePosition(job.id, job.status),
      result: job.result,
      error: job.error,
    };
  }

  private readQueuePosition(jobId: string, status: BackupJobStatus) {
    if (status === "running") {
      return 0;
    }
    if (status !== "queued") {
      return -1;
    }

    const queuedIndex = this.queue.findIndex((entry) => entry.jobId === jobId);
    if (queuedIndex < 0) {
      return this.activeJobId ? 1 : 0;
    }
    return queuedIndex + (this.activeJobId ? 1 : 0);
  }
}
