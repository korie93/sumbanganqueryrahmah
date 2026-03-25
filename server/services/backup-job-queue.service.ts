import { logger } from "../lib/logger";
import type {
  BackupJobError,
  BackupJobRecord,
  BackupJobSnapshot,
  BackupJobType,
  CreateBackupJobInput,
} from "../repositories/backup-job.repository";

type BackupJobOperationResponse = {
  statusCode: number;
  body: unknown;
};

type BackupJobRepositoryLike = {
  createJob(input: CreateBackupJobInput): Promise<BackupJobSnapshot>;
  getJobSnapshot(jobId: string): Promise<BackupJobSnapshot | null>;
  claimNextQueuedJob(): Promise<BackupJobRecord | null>;
  completeJob(params: {
    jobId: string;
    result: unknown;
    backupId?: string | null;
    backupName?: string | null;
  }): Promise<void>;
  failJob(params: {
    jobId: string;
    error: BackupJobError;
  }): Promise<void>;
  markRunningJobsFailed(message: string): Promise<void>;
  pruneHistory(maxRetainedJobs: number): Promise<void>;
};

type BackupJobExecutorDeps = {
  repository: BackupJobRepositoryLike;
  executeCreate: (params: { name: string; username: string }) => Promise<BackupJobOperationResponse>;
  executeRestore: (params: { backupId: string; username: string }) => Promise<BackupJobOperationResponse>;
  ensureReady?: () => Promise<void>;
  maxRetainedJobs?: number;
  interruptedJobMessage?: string;
};

export type { BackupJobError, BackupJobSnapshot, BackupJobType } from "../repositories/backup-job.repository";

export class BackupJobQueueService {
  private readonly maxRetainedJobs: number;
  private readonly interruptedJobMessage: string;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private runLoopPromise: Promise<void> | null = null;

  constructor(private readonly deps: BackupJobExecutorDeps) {
    this.maxRetainedJobs = Math.max(1, deps.maxRetainedJobs ?? 25);
    this.interruptedJobMessage =
      deps.interruptedJobMessage
      || "Backup job was interrupted by a server restart before completion.";
  }

  async start(): Promise<void> {
    await this.ensureStarted();
    void this.runQueueLoop();
  }

  async enqueue(input: CreateBackupJobInput): Promise<BackupJobSnapshot> {
    await this.ensureStarted();
    const job = await this.deps.repository.createJob(input);
    void this.runQueueLoop();
    return job;
  }

  async getJob(jobId: string): Promise<BackupJobSnapshot | null> {
    await this.ensureStarted();
    return this.deps.repository.getJobSnapshot(jobId);
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) {
      return;
    }
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = (async () => {
      if (this.deps.ensureReady) {
        await this.deps.ensureReady();
      }
      await this.deps.repository.markRunningJobsFailed(this.interruptedJobMessage);
      this.started = true;
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async runQueueLoop(): Promise<void> {
    if (this.runLoopPromise) {
      return this.runLoopPromise;
    }

    this.runLoopPromise = (async () => {
      await this.ensureStarted();

      while (true) {
        const nextJob = await this.deps.repository.claimNextQueuedJob();
        if (!nextJob) {
          break;
        }

        await this.executeJob(nextJob);
        await this.deps.repository.pruneHistory(this.maxRetainedJobs);
      }
    })().finally(() => {
      this.runLoopPromise = null;
    });

    return this.runLoopPromise;
  }

  private async executeJob(job: BackupJobRecord): Promise<void> {
    try {
      const response = await this.executeJobByType(job);
      if (response.statusCode >= 400) {
        await this.deps.repository.failJob({
          jobId: job.id,
          error: {
            statusCode: response.statusCode,
            message: this.readFailureMessage(response.body),
          },
        });
        return;
      }

      const backupIdentity = this.extractBackupIdentity(job.type, response.body);
      await this.deps.repository.completeJob({
        jobId: job.id,
        result: response.body,
        backupId: backupIdentity.backupId ?? job.backupId,
        backupName: backupIdentity.backupName ?? job.backupName,
      });
    } catch (error) {
      await this.deps.repository.failJob({
        jobId: job.id,
        error: {
          statusCode: 500,
          message:
            error instanceof Error && error.message.trim()
              ? error.message
              : "Unexpected backup job failure.",
        },
      });
      logger.error("Backup background job failed", {
        jobId: job.id,
        type: job.type,
        error,
      });
    }
  }

  private async executeJobByType(job: BackupJobRecord): Promise<BackupJobOperationResponse> {
    if (job.type === "create") {
      return this.deps.executeCreate({
        name: job.backupName || "",
        username: job.requestedBy,
      });
    }

    if (!job.backupId) {
      return {
        statusCode: 400,
        body: {
          message: "Backup restore job is missing the backup id.",
        },
      };
    }

    return this.deps.executeRestore({
      backupId: job.backupId,
      username: job.requestedBy,
    });
  }

  private readFailureMessage(body: unknown): string {
    if (body && typeof body === "object") {
      const message = String((body as Record<string, unknown>).message ?? "").trim();
      if (message) {
        return message;
      }
    }
    return "Backup job failed.";
  }

  private extractBackupIdentity(
    jobType: BackupJobType,
    result: unknown,
  ): { backupId: string | null; backupName: string | null } {
    if (!result || typeof result !== "object") {
      return { backupId: null, backupName: null };
    }

    const resultRecord = result as Record<string, unknown>;
    if (jobType === "create") {
      return {
        backupId: this.normalizeOptionalText(resultRecord.id),
        backupName: this.normalizeOptionalText(resultRecord.name),
      };
    }

    return {
      backupId: this.normalizeOptionalText(resultRecord.backupId),
      backupName: this.normalizeOptionalText(resultRecord.backupName),
    };
  }

  private normalizeOptionalText(value: unknown): string | null {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized : null;
  }
}
