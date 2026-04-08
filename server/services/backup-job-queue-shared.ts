import type {
  BackupJobError,
  BackupJobRecord,
  BackupJobSnapshot,
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

export type { BackupJobOperationResponse, BackupJobRepositoryLike, BackupJobExecutorDeps };
export type {
  BackupJobError,
  BackupJobRecord,
  BackupJobSnapshot,
  BackupJobType,
  CreateBackupJobInput,
} from "../repositories/backup-job.repository";
