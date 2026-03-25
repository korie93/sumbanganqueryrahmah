import { db } from "../db-postgres";
import { logger } from "../lib/logger";
import {
  claimNextCollectionRecordDailyRollupRefreshSlice,
  completeCollectionRecordDailyRollupRefreshSlice,
  failCollectionRecordDailyRollupRefreshSlice,
  markRunningCollectionRecordDailyRollupRefreshSlicesQueued,
  refreshCollectionRecordDailyRollupSlice,
  type CollectionRecordDailyRollupSlice,
} from "../repositories/collection-record-repository-utils";

type CollectionRollupRefreshQueueRepositoryLike = {
  claimNextSlice(now?: Date): Promise<Required<CollectionRecordDailyRollupSlice> | null>;
  completeSlice(slice: CollectionRecordDailyRollupSlice): Promise<void>;
  failSlice(params: {
    slice: CollectionRecordDailyRollupSlice;
    errorMessage: string;
    nextAttemptAt: Date;
  }): Promise<void>;
  markRunningSlicesQueued(): Promise<void>;
  refreshSlice(slice: CollectionRecordDailyRollupSlice): Promise<void>;
};

type CollectionRollupRefreshQueueDeps = {
  repository?: CollectionRollupRefreshQueueRepositoryLike;
  ensureReady?: () => Promise<void>;
  idlePollMs?: number;
  retryDelayMs?: number;
};

const DEFAULT_IDLE_POLL_MS = 2_000;
const DEFAULT_RETRY_DELAY_MS = 15_000;

export class CollectionRollupRefreshQueueService {
  private readonly repository: CollectionRollupRefreshQueueRepositoryLike;
  private readonly idlePollMs: number;
  private readonly retryDelayMs: number;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private runPromise: Promise<void> | null = null;
  private nextTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: CollectionRollupRefreshQueueDeps = {}) {
    this.repository = deps.repository || {
      claimNextSlice: (now?: Date) => claimNextCollectionRecordDailyRollupRefreshSlice(now),
      completeSlice: (slice) => completeCollectionRecordDailyRollupRefreshSlice(slice),
      failSlice: (params) => failCollectionRecordDailyRollupRefreshSlice(params),
      markRunningSlicesQueued: () => markRunningCollectionRecordDailyRollupRefreshSlicesQueued(),
      refreshSlice: (slice) => refreshCollectionRecordDailyRollupSlice(db, slice),
    };
    this.idlePollMs = Math.max(250, deps.idlePollMs ?? DEFAULT_IDLE_POLL_MS);
    this.retryDelayMs = Math.max(1_000, deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  }

  async start(): Promise<void> {
    await this.ensureStarted();
    this.scheduleRun(0);
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
      await this.repository.markRunningSlicesQueued();
      this.started = true;
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private scheduleRun(delayMs: number): void {
    if (this.runPromise) {
      return;
    }
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }

    this.nextTimer = setTimeout(() => {
      this.nextTimer = null;
      void this.runLoop();
    }, Math.max(0, delayMs));
    this.nextTimer.unref?.();
  }

  private async runLoop(): Promise<void> {
    if (this.runPromise) {
      return this.runPromise;
    }

    this.runPromise = (async () => {
      await this.ensureStarted();

      while (true) {
        const nextSlice = await this.repository.claimNextSlice(new Date());
        if (!nextSlice) {
          break;
        }

        try {
          await this.repository.refreshSlice(nextSlice);
          await this.repository.completeSlice(nextSlice);
        } catch (error) {
          const errorMessage =
            error instanceof Error && error.message.trim()
              ? error.message
              : "Collection rollup refresh failed.";
          await this.repository.failSlice({
            slice: nextSlice,
            errorMessage,
            nextAttemptAt: new Date(Date.now() + this.retryDelayMs),
          });
          logger.error("Collection rollup background refresh failed", {
            slice: nextSlice,
            error,
          });
        }
      }
    })().finally(() => {
      this.runPromise = null;
      this.scheduleRun(this.idlePollMs);
    });

    return this.runPromise;
  }
}
