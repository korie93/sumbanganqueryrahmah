import type { Queue } from "bullmq";
import type { BackgroundQueueConfig } from "./config";

export const ORPHANED_UPLOAD_CLEANUP_JOB_NAME = "orphaned-uploads";

type CleanupQueueLike = Pick<Queue, "add">;

export async function registerCleanupRepeatableJob(
  cleanupQueue: CleanupQueueLike,
  config: Pick<
    BackgroundQueueConfig,
    "cleanupRepeatMs" | "removeOnComplete" | "removeOnFail"
  >,
): Promise<void> {
  await cleanupQueue.add(
    ORPHANED_UPLOAD_CLEANUP_JOB_NAME,
    {},
    {
      jobId: ORPHANED_UPLOAD_CLEANUP_JOB_NAME,
      removeOnComplete: config.removeOnComplete,
      removeOnFail: config.removeOnFail,
      repeat: {
        every: config.cleanupRepeatMs,
      },
    },
  );
}

