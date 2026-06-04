import assert from "node:assert/strict";
import test from "node:test";
import { PostgresStorageCore } from "../../storage/postgres/postgres-storage-core";

class InstrumentedPostgresStorageCore extends PostgresStorageCore {
  readonly events: string[] = [];
  maxConcurrent = 0;
  private activeCount = 0;

  private async track(name: string, delayMs = 0) {
    this.events.push(`start:${name}`);
    this.activeCount += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.activeCount);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    this.activeCount -= 1;
    this.events.push(`end:${name}`);
  }

  protected override async ensureUsersTable() { await this.track("users-table"); }
  protected override async ensureImportsTable() { await this.track("imports-table", 5); }
  protected override async ensureDataRowsTable() { await this.track("data-rows-table", 5); }
  protected override async ensureUserActivityTable() { await this.track("user-activity-table", 5); }
  protected override async ensureAuditLogsTable() { await this.track("audit-logs-table", 5); }
  protected override async ensureMutationIdempotencyTable() { await this.track("mutation-idempotency-table", 5); }
  protected override async ensureMonitorAlertHistoryTable() { await this.track("monitor-alert-history-table", 5); }
  protected override async ensureBannedSessionsTable() { await this.track("banned-sessions-table", 5); }
  protected override async ensureCollectionRecordsTable() { await this.track("collection-records-table"); }
  protected override async ensureCollectionStaffNicknamesTable() { await this.track("collection-staff-nicknames-table"); }
  protected override async ensureCollectionAdminGroupsTables() { await this.track("collection-admin-groups-tables"); }
  protected override async ensureCollectionNicknameSessionsTable() { await this.track("collection-nickname-sessions-table"); }
  protected override async ensureCollectionAdminVisibleNicknamesTable() { await this.track("collection-admin-visible-nicknames-table"); }
  protected override async ensureCollectionDailyTables() { await this.track("collection-daily-tables"); }
  protected override async seedDefaultUsers() { await this.track("default-users-seed"); }
  protected override async ensureBackupsTable() { await this.track("backups-table", 5); }
  protected override async ensureAiTables() { await this.track("ai-tables", 5); }
  protected override async ensureSpatialTables() { await this.track("spatial-tables", 5); }
  protected override async ensureCategoryRulesTable() { await this.track("category-rules-table", 5); }
  protected override async ensureCategoryStatsTable() { await this.track("category-stats-table", 5); }
  protected override async ensureSettingsTables() { await this.track("settings-tables", 5); }
  protected override async ensurePerformanceIndexes() { await this.track("performance-indexes"); }
}

test("PostgresStorageCore keeps dependent bootstrap steps ordered while parallelizing independent groups", async () => {
  const storage = new InstrumentedPostgresStorageCore();

  await storage.init();

  assert.equal(storage.maxConcurrent >= 2, true);

  const usersEndIndex = storage.events.indexOf("end:users-table");
  const importsStartIndex = storage.events.indexOf("start:imports-table");
  const importsEndIndex = storage.events.indexOf("end:imports-table");
  const dataRowsStartIndex = storage.events.indexOf("start:data-rows-table");
  const collectionDailyEndIndex = storage.events.indexOf("end:collection-daily-tables");
  const defaultSeedStartIndex = storage.events.indexOf("start:default-users-seed");
  const backupsStartIndex = storage.events.indexOf("start:backups-table");
  const performanceStartIndex = storage.events.indexOf("start:performance-indexes");
  const supportingGroupStartIndex = Math.min(
    storage.events.indexOf("start:banned-sessions-table"),
    storage.events.indexOf("start:ai-tables"),
    storage.events.indexOf("start:spatial-tables"),
    storage.events.indexOf("start:category-rules-table"),
    storage.events.indexOf("start:category-stats-table"),
    storage.events.indexOf("start:settings-tables"),
  );
  const supportingGroupEndIndex = Math.max(
    storage.events.indexOf("end:banned-sessions-table"),
    storage.events.indexOf("end:ai-tables"),
    storage.events.indexOf("end:spatial-tables"),
    storage.events.indexOf("end:category-rules-table"),
    storage.events.indexOf("end:category-stats-table"),
    storage.events.indexOf("end:settings-tables"),
  );

  assert.equal(usersEndIndex < importsStartIndex, true);
  assert.equal(importsEndIndex < dataRowsStartIndex, true);
  assert.equal(collectionDailyEndIndex < defaultSeedStartIndex, true);
  assert.equal(defaultSeedStartIndex < backupsStartIndex, true);
  assert.equal(backupsStartIndex < performanceStartIndex, true);
  assert.equal(performanceStartIndex < supportingGroupStartIndex, true);
  assert.equal(supportingGroupStartIndex < supportingGroupEndIndex, true);
});
