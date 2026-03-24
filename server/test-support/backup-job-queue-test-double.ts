import crypto from "node:crypto";
import type {
  BackupJobError,
  BackupJobRecord,
  BackupJobSnapshot,
  BackupJobType,
  CreateBackupJobInput,
} from "../repositories/backup-job.repository";

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export function createInMemoryBackupJobRepository() {
  const jobs = new Map<string, BackupJobRecord>();

  const readQueuePosition = (job: BackupJobRecord) => {
    if (job.status === "running") {
      return 0;
    }
    if (job.status !== "queued") {
      return -1;
    }

    const queuedAhead = Array.from(jobs.values()).filter((candidate) =>
      candidate.status === "queued"
      && (
        candidate.requestedAt.getTime() < job.requestedAt.getTime()
        || (
          candidate.requestedAt.getTime() === job.requestedAt.getTime()
          && candidate.id < job.id
        )
      )
    ).length;
    const runningCount = Array.from(jobs.values()).filter((candidate) => candidate.status === "running").length;
    return queuedAhead + (runningCount > 0 ? 1 : 0);
  };

  const toSnapshot = (job: BackupJobRecord): BackupJobSnapshot => ({
    id: job.id,
    type: job.type,
    status: job.status,
    requestedBy: job.requestedBy,
    requestedAt: job.requestedAt.toISOString(),
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    backupId: job.backupId,
    backupName: job.backupName,
    queuePosition: readQueuePosition(job),
    result: job.result,
    error: job.error,
  });

  return {
    async createJob(input: CreateBackupJobInput): Promise<BackupJobSnapshot> {
      const job: BackupJobRecord = {
        id: crypto.randomUUID(),
        type: input.type,
        status: "queued",
        requestedBy: input.requestedBy,
        requestedAt: new Date(),
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
        backupId: normalizeOptionalText(input.backupId),
        backupName: normalizeOptionalText(input.backupName),
        result: null,
        error: null,
      };
      jobs.set(job.id, job);
      return toSnapshot(job);
    },

    async getJobSnapshot(jobId: string): Promise<BackupJobSnapshot | null> {
      const job = jobs.get(jobId);
      return job ? toSnapshot(job) : null;
    },

    async claimNextQueuedJob(): Promise<BackupJobRecord | null> {
      const nextJob = Array.from(jobs.values())
        .filter((job) => job.status === "queued")
        .sort((left, right) => {
          if (left.requestedAt.getTime() !== right.requestedAt.getTime()) {
            return left.requestedAt.getTime() - right.requestedAt.getTime();
          }
          return left.id.localeCompare(right.id);
        })[0];

      if (!nextJob) {
        return null;
      }

      nextJob.status = "running";
      nextJob.startedAt = nextJob.startedAt ?? new Date();
      nextJob.updatedAt = new Date();
      return { ...nextJob };
    },

    async completeJob(params: {
      jobId: string;
      result: unknown;
      backupId?: string | null;
      backupName?: string | null;
    }): Promise<void> {
      const job = jobs.get(params.jobId);
      if (!job) {
        return;
      }
      job.status = "completed";
      job.result = params.result;
      job.error = null;
      job.finishedAt = new Date();
      job.updatedAt = new Date();
      job.backupId = normalizeOptionalText(params.backupId) ?? job.backupId;
      job.backupName = normalizeOptionalText(params.backupName) ?? job.backupName;
    },

    async failJob(params: {
      jobId: string;
      error: BackupJobError;
    }): Promise<void> {
      const job = jobs.get(params.jobId);
      if (!job) {
        return;
      }
      job.status = "failed";
      job.result = null;
      job.error = params.error;
      job.finishedAt = new Date();
      job.updatedAt = new Date();
    },

    async markRunningJobsFailed(message: string): Promise<void> {
      for (const job of jobs.values()) {
        if (job.status !== "running") {
          continue;
        }
        job.status = "failed";
        job.error = {
          statusCode: 500,
          message,
        };
        job.finishedAt = new Date();
        job.updatedAt = new Date();
      }
    },

    async pruneHistory(maxRetainedJobs: number): Promise<void> {
      const removableJobs = Array.from(jobs.values())
        .filter((job) => job.status === "completed" || job.status === "failed")
        .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())
        .slice(maxRetainedJobs);

      for (const job of removableJobs) {
        jobs.delete(job.id);
      }
    },
  };
}
