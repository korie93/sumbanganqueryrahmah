import type { Job } from "bullmq";
import { logger } from "../../lib/logger";

export type BackupJobName = "scheduled-encrypted-backup";
export type BackupJobData = {
  readonly requestedBy: "system";
  readonly reason: string;
};
export type BackupJobResult = {
  readonly queued: boolean;
  readonly reason: string;
};
export type BackupJob = Job<BackupJobData, BackupJobResult, BackupJobName>;

export async function processBackupJob(job: BackupJob): Promise<BackupJobResult> {
  if (job.name !== "scheduled-encrypted-backup") {
    throw new Error(`Unsupported backup job: ${job.name}`);
  }

  logger.info("Scheduled backup queue job observed", {
    event: "scheduled_backup_job_observed",
    reason: job.data.reason,
  });
  return {
    queued: false,
    reason: "scheduled-backup-runner-not-enabled",
  };
}

