import type { BackgroundQueueName } from "./config";
import { BACKGROUND_QUEUE_NAMES } from "./config";

export type BackgroundQueueCounts = {
  readonly active: number;
  readonly completed: number;
  readonly delayed: number;
  readonly failed: number;
  readonly paused: number;
  readonly waiting: number;
};

export type BackgroundQueueHealthEntry = BackgroundQueueCounts & {
  readonly status: "disabled" | "error" | "ready";
};

export type BackgroundQueueHealthSnapshot = {
  readonly configured: boolean;
  readonly queues: Record<BackgroundQueueName, BackgroundQueueHealthEntry>;
  readonly redisSource: string;
  readonly workers: Record<BackgroundQueueName, "disabled" | "error" | "running" | "stopped">;
};

export type QueueHealthSource = {
  getJobCounts(...statuses: string[]): Promise<Record<string, number>>;
};

export type WorkerHealthSource = {
  isRunning(): boolean;
};

type BuildBackgroundQueueHealthSnapshotParams = {
  readonly configured: boolean;
  readonly queues: Partial<Record<BackgroundQueueName, QueueHealthSource | null>>;
  readonly redisSource: string;
  readonly workers: Partial<Record<BackgroundQueueName, WorkerHealthSource | null>>;
};

const EMPTY_COUNTS: BackgroundQueueCounts = {
  active: 0,
  completed: 0,
  delayed: 0,
  failed: 0,
  paused: 0,
  waiting: 0,
};

function readCount(counts: Record<string, number>, key: keyof BackgroundQueueCounts): number {
  const value = counts[key];
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export async function buildBackgroundQueueHealthSnapshot(
  params: BuildBackgroundQueueHealthSnapshotParams,
): Promise<BackgroundQueueHealthSnapshot> {
  const queues = {} as Record<BackgroundQueueName, BackgroundQueueHealthEntry>;
  const workers = {} as Record<BackgroundQueueName, "disabled" | "error" | "running" | "stopped">;

  await Promise.all(BACKGROUND_QUEUE_NAMES.map(async (queueName) => {
    const queue = params.queues[queueName] ?? null;
    const worker = params.workers[queueName] ?? null;

    if (!params.configured || !queue) {
      queues[queueName] = {
        ...EMPTY_COUNTS,
        status: "disabled",
      };
      workers[queueName] = "disabled";
      return;
    }

    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "delayed",
        "failed",
        "completed",
        "paused",
      );
      queues[queueName] = {
        active: readCount(counts, "active"),
        completed: readCount(counts, "completed"),
        delayed: readCount(counts, "delayed"),
        failed: readCount(counts, "failed"),
        paused: readCount(counts, "paused"),
        waiting: readCount(counts, "waiting"),
        status: "ready",
      };
    } catch {
      queues[queueName] = {
        ...EMPTY_COUNTS,
        status: "error",
      };
    }

    try {
      workers[queueName] = worker?.isRunning() ? "running" : "stopped";
    } catch {
      workers[queueName] = "error";
    }
  }));

  return {
    configured: params.configured,
    queues,
    redisSource: params.redisSource,
    workers,
  };
}

