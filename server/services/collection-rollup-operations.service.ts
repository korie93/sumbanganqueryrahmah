import { db } from "../db-postgres";
import {
  clearCollectionRecordDailyRollupRefreshQueue,
  getCollectionRecordDailyRollupRefreshQueueSnapshot,
  markRunningCollectionRecordDailyRollupRefreshSlicesQueued,
  rebuildCollectionRecordDailyRollups,
  requeueCollectionRecordDailyRollupRefreshFailures,
} from "../repositories/collection-record-repository-utils";
import type { CollectionRollupRefreshQueueService } from "./collection-rollup-refresh-queue.service";

type CollectionRollupOperationsDeps = {
  ensureReady?: () => Promise<void>;
  queueService: Pick<CollectionRollupRefreshQueueService, "wake">;
};

export class CollectionRollupOperationsService {
  constructor(private readonly deps: CollectionRollupOperationsDeps) {}

  private async ensureReady(): Promise<void> {
    if (this.deps.ensureReady) {
      await this.deps.ensureReady();
    }
  }

  async getStatus() {
    await this.ensureReady();
    return getCollectionRecordDailyRollupRefreshQueueSnapshot();
  }

  async drainQueueNow() {
    await this.ensureReady();
    await this.deps.queueService.wake();
    return {
      ok: true as const,
      action: "drain",
      message: "Collection rollup queue drain requested.",
      snapshot: await getCollectionRecordDailyRollupRefreshQueueSnapshot(),
    };
  }

  async retryFailedSlices() {
    await this.ensureReady();
    const requeuedCount = await requeueCollectionRecordDailyRollupRefreshFailures();
    await this.deps.queueService.wake();
    return {
      ok: true as const,
      action: "retry-failures",
      message: requeuedCount > 0
        ? `Requeued ${requeuedCount} failed collection rollup slice(s).`
        : "No failed collection rollup slices needed retry.",
      requeuedCount,
      snapshot: await getCollectionRecordDailyRollupRefreshQueueSnapshot(),
    };
  }

  async autoHealRunningSlices() {
    await this.ensureReady();
    await markRunningCollectionRecordDailyRollupRefreshSlicesQueued();
    await this.deps.queueService.wake();
    return {
      ok: true as const,
      action: "auto-heal",
      message: "Requeued any interrupted collection rollup slices and requested an immediate drain.",
      snapshot: await getCollectionRecordDailyRollupRefreshQueueSnapshot(),
    };
  }

  async rebuildAllRollups() {
    await this.ensureReady();
    await rebuildCollectionRecordDailyRollups(db);
    await clearCollectionRecordDailyRollupRefreshQueue();
    return {
      ok: true as const,
      action: "rebuild",
      message: "Rebuilt collection report rollups and cleared the refresh queue.",
      snapshot: await getCollectionRecordDailyRollupRefreshQueueSnapshot(),
    };
  }
}
