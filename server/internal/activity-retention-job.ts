import {
  createBackgroundSweepJob,
  type BackgroundSweepJob,
} from "./background-sweep-job";

export const ACTIVITY_RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1_000;

type ActivityRetentionJobOptions = {
  intervalMs?: number;
  runCleanup: (now: Date) => Promise<void>;
};

export function startActivityRetentionJob(
  options: ActivityRetentionJobOptions,
): BackgroundSweepJob {
  return createBackgroundSweepJob({
    failureMessage: "Automatic activity retention cleanup failed",
    intervalMs: options.intervalMs ?? ACTIVITY_RETENTION_SWEEP_INTERVAL_MS,
    run: async (now) => {
      await options.runCleanup(new Date(now));
    },
  });
}
