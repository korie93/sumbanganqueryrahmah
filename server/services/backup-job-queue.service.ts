import type {
  BackupJobRecord,
  BackupJobSnapshot,
  CreateBackupJobInput,
} from "./backup-job-queue-shared";
import { executeQueuedBackupJob } from "./backup-job-queue-execution-utils";
import type { BackupJobExecutorDeps } from "./backup-job-queue-shared";
export type { BackupJobError, BackupJobSnapshot, BackupJobType } from "./backup-job-queue-shared";

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
    await executeQueuedBackupJob(this.deps, job);
  }
}
