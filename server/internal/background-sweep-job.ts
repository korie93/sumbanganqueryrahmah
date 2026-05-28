import { logger as defaultLogger } from "../lib/logger";

type BackgroundSweepLogger = Pick<typeof defaultLogger, "warn">;

export type BackgroundSweepJobStats = {
  completedRuns: number;
  failedRuns: number;
  pendingRuns: number;
  skippedRuns: number;
};

export type BackgroundSweepJob = {
  getStats: () => BackgroundSweepJobStats;
  isActive: () => boolean;
  stop: () => void;
  trigger: (now?: number) => Promise<void>;
};

type BackgroundSweepJobOptions = {
  failureMessage: string;
  intervalMs: number;
  logger?: BackgroundSweepLogger;
  run: (now: number) => Promise<void> | void;
};

function describeSweepError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown background sweep failure";
}

export function createBackgroundSweepJob(options: BackgroundSweepJobOptions): BackgroundSweepJob {
  const sink = options.logger ?? defaultLogger;
  const stats: BackgroundSweepJobStats = {
    completedRuns: 0,
    failedRuns: 0,
    pendingRuns: 0,
    skippedRuns: 0,
  };
  let pendingRunAt: number | null = null;
  let running = false;
  let stopped = false;

  async function runOneSweep(now: number): Promise<void> {
    try {
      await options.run(now);
      stats.completedRuns += 1;
    } catch (error) {
      stats.failedRuns += 1;
      sink.warn(options.failureMessage, {
        error: describeSweepError(error),
      });
    }
  }

  async function trigger(now = Date.now()): Promise<void> {
    if (stopped) {
      return;
    }

    if (running) {
      pendingRunAt = now;
      stats.skippedRuns += 1;
      return;
    }

    running = true;
    let nextRunAt: number | null = now;
    try {
      while (nextRunAt !== null && !stopped) {
        const currentRunAt = nextRunAt;
        nextRunAt = null;
        await runOneSweep(currentRunAt);

        if (pendingRunAt !== null) {
          nextRunAt = pendingRunAt;
          pendingRunAt = null;
          stats.pendingRuns += 1;
        }
      }
    } finally {
      running = false;
    }
  }

  const intervalHandle = setInterval(() => {
    void trigger(Date.now());
  }, options.intervalMs);
  intervalHandle.unref?.();

  return {
    getStats() {
      return { ...stats };
    },
    isActive() {
      return !stopped;
    },
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      pendingRunAt = null;
      clearInterval(intervalHandle);
    },
    trigger,
  };
}
