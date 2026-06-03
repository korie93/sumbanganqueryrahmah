import {
  BackgroundQueueRuntime,
  createBackgroundQueueRuntime,
} from "./runtime";
import type { Queue } from "bullmq";

const backgroundQueueRuntime = createBackgroundQueueRuntime();

export let emailQueue: Queue | null = backgroundQueueRuntime.getQueue("email");
export let auditQueue: Queue | null = backgroundQueueRuntime.getQueue("audit");
export let backupQueue: Queue | null = backgroundQueueRuntime.getQueue("backup");
export let cleanupQueue: Queue | null = backgroundQueueRuntime.getQueue("cleanup");

function refreshQueueExports(): void {
  emailQueue = backgroundQueueRuntime.getQueue("email");
  auditQueue = backgroundQueueRuntime.getQueue("audit");
  backupQueue = backgroundQueueRuntime.getQueue("backup");
  cleanupQueue = backgroundQueueRuntime.getQueue("cleanup");
}

export function getBackgroundQueueRuntime(): BackgroundQueueRuntime {
  return backgroundQueueRuntime;
}

export async function startBackgroundQueues(): Promise<void> {
  await backgroundQueueRuntime.start();
  refreshQueueExports();
}

export async function closeBackgroundQueues(): Promise<void> {
  await backgroundQueueRuntime.close();
  refreshQueueExports();
}

export async function getBackgroundQueueHealthSnapshot() {
  return backgroundQueueRuntime.getHealthSnapshot();
}
