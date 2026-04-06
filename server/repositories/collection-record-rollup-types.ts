type CollectionRepositoryExecute = (typeof import("../db-postgres"))["db"]["execute"];

export type CollectionRepositoryExecutor = {
  execute: CollectionRepositoryExecute;
};

export type CollectionRecordDailyRollupSlice = {
  paymentDate?: string | null;
  createdByLogin?: string | null;
  collectionStaffNickname?: string | null;
};

export type NormalizedCollectionRecordDailyRollupSlice = Required<CollectionRecordDailyRollupSlice>;

export type CollectionRecordDailyRollupRefreshQueueSnapshot = {
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
};

export type CollectionRollupFreshnessStatus = "fresh" | "warming" | "stale";

export type CollectionRollupFreshnessSnapshot = CollectionRecordDailyRollupRefreshQueueSnapshot & {
  status: CollectionRollupFreshnessStatus;
};
