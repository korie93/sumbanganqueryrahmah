import type { Job } from "bullmq";
import {
  cleanupOrphanedUploads,
  type OrphanedUploadCleanupResult,
} from "../../jobs/cleanup-orphaned-uploads";

export type CleanupJobName = "orphaned-uploads";
export type CleanupJobData = Record<string, never>;
export type CleanupJob = Job<CleanupJobData, OrphanedUploadCleanupResult, CleanupJobName>;

export async function processCleanupJob(
  job: CleanupJob,
): Promise<OrphanedUploadCleanupResult> {
  if (job.name !== "orphaned-uploads") {
    throw new Error(`Unsupported cleanup job: ${job.name}`);
  }

  return cleanupOrphanedUploads();
}

