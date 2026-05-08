import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPostgresStorageBootstrapPlan,
  PostgresStorageCore,
} from "../../storage/postgres/postgres-storage-core";
import { runtimeConfig } from "../../config/runtime";

const EXPECTED_INIT_STEPS = [
  "users",
  "imports",
  "dataRows",
  "userActivity",
  "auditLogs",
  "mutationIdempotency",
  "monitorAlertHistory",
  "collectionRecords",
  "collectionStaffNicknames",
  "collectionAdminGroups",
  "collectionNicknameSessions",
  "collectionAdminVisibleNicknames",
  "collectionDaily",
  "seedDefaultUsers",
  "backups",
  "performanceIndexes",
  "bannedSessions",
  "aiTables",
  "spatialTables",
  "categoryRules",
  "categoryStats",
  "settings",
] as const;

function createNoopBootstrapHandlers() {
  const noop = async () => {};
  return {
    ensureUsersTable: noop,
    ensureImportsTable: noop,
    ensureDataRowsTable: noop,
    ensureUserActivityTable: noop,
    ensureAuditLogsTable: noop,
    ensureMutationIdempotencyTable: noop,
    ensureMonitorAlertHistoryTable: noop,
    ensureCollectionRecordsTable: noop,
    ensureCollectionStaffNicknamesTable: noop,
    ensureCollectionAdminGroupsTables: noop,
    ensureCollectionNicknameSessionsTable: noop,
    ensureCollectionAdminVisibleNicknamesTable: noop,
    ensureCollectionDailyTables: noop,
    seedDefaultUsers: noop,
    ensureBackupsTable: noop,
    ensurePerformanceIndexes: noop,
    ensureBannedSessionsTable: noop,
    ensureAiTables: noop,
    ensureSpatialTables: noop,
    ensureCategoryRulesTable: noop,
    ensureCategoryStatsTable: noop,
    ensureSettingsTables: noop,
  };
}

function flattenBootstrapPlanStepNames(
  plan: ReturnType<typeof buildPostgresStorageBootstrapPlan>,
) {
  return plan.flatMap((step) => ("steps" in step ? step.steps.map((nested) => nested.name) : step.name));
}

class InitGuardStorage extends PostgresStorageCore {
  readonly calls: string[] = [];
  private markUsersStepStarted: () => void = () => {};
  private releaseUsersStep: (() => void) | null = null;
  readonly usersStepStarted = new Promise<void>((resolve) => {
    this.markUsersStepStarted = resolve;
  });

  constructor(private readonly blockUsersStep = true) {
    super();
  }

  releaseUsersTable() {
    if (!this.releaseUsersStep) {
      throw new Error("users table step has not started");
    }

    this.releaseUsersStep();
    this.releaseUsersStep = null;
  }

  private async record(step: (typeof EXPECTED_INIT_STEPS)[number]) {
    this.calls.push(step);
    if (step === "users" && this.blockUsersStep) {
      this.markUsersStepStarted();
      await new Promise<void>((resolve) => {
        this.releaseUsersStep = resolve;
      });
    }
  }

  protected override async ensureUsersTable() {
    await this.record("users");
  }

  protected override async ensureImportsTable() {
    await this.record("imports");
  }

  protected override async ensureDataRowsTable() {
    await this.record("dataRows");
  }

  protected override async ensureUserActivityTable() {
    await this.record("userActivity");
  }

  protected override async ensureAuditLogsTable() {
    await this.record("auditLogs");
  }

  protected override async ensureMutationIdempotencyTable() {
    await this.record("mutationIdempotency");
  }

  protected override async ensureMonitorAlertHistoryTable() {
    await this.record("monitorAlertHistory");
  }

  protected override async ensureCollectionRecordsTable() {
    await this.record("collectionRecords");
  }

  protected override async ensureCollectionStaffNicknamesTable() {
    await this.record("collectionStaffNicknames");
  }

  protected override async ensureCollectionAdminGroupsTables() {
    await this.record("collectionAdminGroups");
  }

  protected override async ensureCollectionNicknameSessionsTable() {
    await this.record("collectionNicknameSessions");
  }

  protected override async ensureCollectionAdminVisibleNicknamesTable() {
    await this.record("collectionAdminVisibleNicknames");
  }

  protected override async ensureCollectionDailyTables() {
    await this.record("collectionDaily");
  }

  protected override async seedDefaultUsers() {
    await this.record("seedDefaultUsers");
  }

  protected override async ensureBackupsTable() {
    await this.record("backups");
  }

  protected override async ensurePerformanceIndexes() {
    await this.record("performanceIndexes");
  }

  protected override async ensureBannedSessionsTable() {
    await this.record("bannedSessions");
  }

  protected override async ensureAiTables() {
    await this.record("aiTables");
  }

  protected override async ensureSpatialTables() {
    await this.record("spatialTables");
  }

  protected override async ensureCategoryRulesTable() {
    await this.record("categoryRules");
  }

  protected override async ensureCategoryStatsTable() {
    await this.record("categoryStats");
  }

  protected override async ensureSettingsTables() {
    await this.record("settings");
  }
}

class RetryableInitStorage extends PostgresStorageCore {
  usersCalls = 0;

  protected override async ensureUsersTable() {
    this.usersCalls += 1;
    if (this.usersCalls === 1) {
      throw new Error("transient bootstrap failure");
    }
  }

  protected override async ensureImportsTable() {}
  protected override async ensureDataRowsTable() {}
  protected override async ensureUserActivityTable() {}
  protected override async ensureAuditLogsTable() {}
  protected override async ensureMutationIdempotencyTable() {}
  protected override async ensureMonitorAlertHistoryTable() {}
  protected override async ensureCollectionRecordsTable() {}
  protected override async ensureCollectionStaffNicknamesTable() {}
  protected override async ensureCollectionAdminGroupsTables() {}
  protected override async ensureCollectionNicknameSessionsTable() {}
  protected override async ensureCollectionAdminVisibleNicknamesTable() {}
  protected override async ensureCollectionDailyTables() {}
  protected override async seedDefaultUsers() {}
  protected override async ensureBackupsTable() {}
  protected override async ensurePerformanceIndexes() {}
  protected override async ensureBannedSessionsTable() {}
  protected override async ensureAiTables() {}
  protected override async ensureSpatialTables() {}
  protected override async ensureCategoryRulesTable() {}
  protected override async ensureCategoryStatsTable() {}
  protected override async ensureSettingsTables() {}
}

async function withRuntimeConfigOverrides<T>(
  overrides: {
    databaseMode?: "runtime" | "migration";
    isProductionLike?: boolean;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const previousDatabaseMode = runtimeConfig.bootstrap.databaseMode;
  const previousProductionLike = runtimeConfig.app.isProductionLike;

  if (overrides.databaseMode !== undefined) {
    runtimeConfig.bootstrap.databaseMode = overrides.databaseMode;
  }

  if (overrides.isProductionLike !== undefined) {
    runtimeConfig.app.isProductionLike = overrides.isProductionLike;
  }

  try {
    return await fn();
  } finally {
    runtimeConfig.bootstrap.databaseMode = previousDatabaseMode;
    runtimeConfig.app.isProductionLike = previousProductionLike;
  }
}

test("PostgresStorageCore exposes a reusable bootstrap preflight plan", () => {
  const plan = buildPostgresStorageBootstrapPlan(createNoopBootstrapHandlers());

  assert.deepEqual(flattenBootstrapPlanStepNames(plan), [
    "users-table",
    "imports-table",
    "data-rows-table",
    "user-activity-table",
    "audit-logs-table",
    "mutation-idempotency-table",
    "monitor-alert-history-table",
    "collection-records-table",
    "collection-staff-nicknames-table",
    "collection-admin-groups-tables",
    "collection-nickname-sessions-table",
    "collection-admin-visible-nicknames-table",
    "collection-daily-tables",
    "default-users-seed",
    "backups-table",
    "performance-indexes",
    "banned-sessions-table",
    "ai-tables",
    "spatial-tables",
    "category-rules-table",
    "category-stats-table",
    "settings-tables",
  ]);
});

test("PostgresStorageCore.init shares concurrent bootstrap work and skips completed work", async () => {
  const storage = new InitGuardStorage();
  const first = storage.init();
  await storage.usersStepStarted;
  const second = storage.init();

  storage.releaseUsersTable();
  await Promise.all([first, second]);
  await storage.init();

  assert.deepEqual(storage.calls, [...EXPECTED_INIT_STEPS]);
});

test("PostgresStorageCore.init preserves runtime bootstrap on production-like hosts", async () => {
  await withRuntimeConfigOverrides(
    {
      databaseMode: "runtime",
      isProductionLike: true,
    },
    async () => {
      const storage = new InitGuardStorage(false);

      await storage.init();

      assert.deepEqual(storage.calls, [...EXPECTED_INIT_STEPS]);
    },
  );
});

test("PostgresStorageCore.init remains retryable after a startup failure", async () => {
  const storage = new RetryableInitStorage();

  await assert.rejects(() => storage.init(), /transient bootstrap failure/);
  await storage.init();
  await storage.init();

  assert.equal(storage.usersCalls, 2);
});

test("PostgresStorageCore.init shares a failed in-flight bootstrap and retries with a fresh attempt", async () => {
  const storage = new RetryableInitStorage();

  const first = storage.init();
  const second = storage.init();

  await assert.rejects(() => Promise.all([first, second]), /transient bootstrap failure/);
  assert.equal(storage.usersCalls, 1);

  await storage.init();

  assert.equal(storage.usersCalls, 2);
});
