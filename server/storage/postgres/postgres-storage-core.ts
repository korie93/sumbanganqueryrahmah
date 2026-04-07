import { parseBackupMetadataSafe } from "../../internal/backupMetadata";
import { AiBootstrap } from "../../internal/aiBootstrap";
import { BackupsBootstrap } from "../../internal/backupsBootstrap";
import { CollectionBootstrap } from "../../internal/collectionBootstrap";
import { CoreSchemaBootstrap } from "../../internal/coreSchemaBootstrap";
import { SettingsBootstrap } from "../../internal/settingsBootstrap";
import { SpatialBootstrap } from "../../internal/spatialBootstrap";
import { UsersBootstrap } from "../../internal/usersBootstrap";
import { isProductionLikeEnvironment } from "../../config/runtime-environment";
import { ActivityRepository } from "../../repositories/activity.repository";
import { AiCategoryRepository } from "../../repositories/ai-category.repository";
import { AiRepository } from "../../repositories/ai.repository";
import { AnalyticsRepository } from "../../repositories/analytics.repository";
import { AuditRepository } from "../../repositories/audit.repository";
import { AuthRepository } from "../../repositories/auth.repository";
import { BackupsRepository } from "../../repositories/backups.repository";
import { CollectionRepository } from "../../repositories/collection.repository";
import { ImportsRepository } from "../../repositories/imports.repository";
import { MutationIdempotencyRepository } from "../../repositories/mutation-idempotency.repository";
import { SearchRepository } from "../../repositories/search.repository";
import { SettingsRepository } from "../../repositories/settings.repository";

export const QUERY_PAGE_LIMIT = 1000;
export const STORAGE_DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1" && !isProductionLikeEnvironment();

export class PostgresStorageCore {
  protected readonly authRepository = new AuthRepository();
  protected readonly importsRepository = new ImportsRepository();
  protected readonly searchRepository = new SearchRepository();
  protected readonly activityRepository = new ActivityRepository({
    ensureBannedSessionsTable: () => this.ensureBannedSessionsTable(),
  });
  protected readonly aiRepository = new AiRepository({
    ensureSpatialTables: () => this.ensureSpatialTables(),
  });
  protected readonly aiCategoryRepository = new AiCategoryRepository();
  protected readonly aiBootstrap = new AiBootstrap();
  protected readonly auditRepository = new AuditRepository();
  protected readonly backupsBootstrap = new BackupsBootstrap();
  protected readonly collectionBootstrap = new CollectionBootstrap();
  protected readonly coreSchemaBootstrap = new CoreSchemaBootstrap();
  protected readonly usersBootstrap = new UsersBootstrap();
  protected readonly backupsRepository = new BackupsRepository({
    ensureBackupsTable: () => this.backupsBootstrap.ensureTable(),
    parseBackupMetadataSafe,
  });
  protected readonly analyticsRepository = new AnalyticsRepository();
  protected readonly collectionRepository = new CollectionRepository();
  protected readonly mutationIdempotencyRepository = new MutationIdempotencyRepository();
  protected readonly settingsRepository = new SettingsRepository();
  protected readonly settingsBootstrap = new SettingsBootstrap();
  protected readonly spatialBootstrap = new SpatialBootstrap();

  constructor() {}

  public async init() {
    await this.ensureUsersTable();
    await this.ensureImportsTable();
    await this.ensureDataRowsTable();
    await this.ensureUserActivityTable();
    await this.ensureAuditLogsTable();
    await this.ensureMutationIdempotencyTable();
    await this.ensureMonitorAlertHistoryTable();
    await this.ensureCollectionRecordsTable();
    await this.ensureCollectionStaffNicknamesTable();
    await this.ensureCollectionAdminGroupsTables();
    await this.ensureCollectionNicknameSessionsTable();
    await this.ensureCollectionAdminVisibleNicknamesTable();
    await this.ensureCollectionDailyTables();
    await this.seedDefaultUsers();
    await this.ensureBackupsTable();
    await this.ensurePerformanceIndexes();
    await this.ensureBannedSessionsTable();
    await this.ensureAiTables();
    await this.ensureSpatialTables();
    await this.ensureCategoryRulesTable();
    await this.ensureCategoryStatsTable();
    await this.ensureSettingsTables();
  }

  protected async ensureUsersTable() {
    await this.usersBootstrap.ensureTable();
  }

  protected async ensureImportsTable() {
    await this.coreSchemaBootstrap.ensureImportsTable();
  }

  protected async ensureDataRowsTable() {
    await this.coreSchemaBootstrap.ensureDataRowsTable();
  }

  protected async ensureUserActivityTable() {
    await this.coreSchemaBootstrap.ensureUserActivityTable();
  }

  protected async ensureAuditLogsTable() {
    await this.coreSchemaBootstrap.ensureAuditLogsTable();
  }

  protected async ensureMutationIdempotencyTable() {
    await this.coreSchemaBootstrap.ensureMutationIdempotencyTable();
  }

  protected async ensureMonitorAlertHistoryTable() {
    await this.coreSchemaBootstrap.ensureMonitorAlertHistoryTable();
  }

  protected async ensureCollectionRecordsTable() {
    await this.collectionBootstrap.ensureRecordsTable();
  }

  protected async ensureCollectionStaffNicknamesTable() {
    await this.collectionBootstrap.ensureStaffNicknamesTable();
  }

  protected async ensureCollectionAdminGroupsTables() {
    await this.collectionBootstrap.ensureAdminGroupsTables();
  }

  protected async ensureCollectionNicknameSessionsTable() {
    await this.collectionBootstrap.ensureNicknameSessionsTable();
  }

  protected async ensureCollectionAdminVisibleNicknamesTable() {
    await this.collectionBootstrap.ensureAdminVisibleNicknamesTable();
  }

  protected async ensureCollectionDailyTables() {
    await this.collectionBootstrap.ensureDailyTables();
  }

  protected async ensurePerformanceIndexes() {
    await this.coreSchemaBootstrap.ensurePerformanceIndexes();
  }

  protected async ensureBannedSessionsTable() {
    await this.coreSchemaBootstrap.ensureBannedSessionsTable();
  }

  protected async ensureAiTables() {
    await this.aiBootstrap.ensureAiTables();
  }

  protected async ensureCategoryStatsTable() {
    await this.aiBootstrap.ensureCategoryStatsTable();
  }

  protected async ensureCategoryRulesTable() {
    await this.aiBootstrap.ensureCategoryRulesTable();
  }

  protected async ensureSettingsTables() {
    await this.settingsBootstrap.ensureTables();
  }

  protected async ensureSpatialTables() {
    await this.spatialBootstrap.ensureTables();
  }

  protected async ensureBackupsTable() {
    await this.backupsBootstrap.ensureTable();
  }

  async ensureBackupsReady(): Promise<void> {
    await this.ensureBackupsTable();
  }

  async ensureCollectionRecordsReady(): Promise<void> {
    await this.ensureCollectionRecordsTable();
  }

  protected async seedDefaultUsers() {
    await this.usersBootstrap.seedDefaultUsers();
  }
}
