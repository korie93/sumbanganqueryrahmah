import { performance } from "node:perf_hooks";
import { parseBackupMetadataSafe } from "../../internal/backupMetadata";
import { AiBootstrap } from "../../internal/aiBootstrap";
import { BackupsBootstrap } from "../../internal/backupsBootstrap";
import { CollectionBootstrap } from "../../internal/collectionBootstrap";
import { CoreSchemaBootstrap } from "../../internal/coreSchemaBootstrap";
import { SettingsBootstrap } from "../../internal/settingsBootstrap";
import { SpatialBootstrap } from "../../internal/spatialBootstrap";
import { UsersBootstrap } from "../../internal/usersBootstrap";
import { runtimeConfig } from "../../config/runtime";
import { logger } from "../../lib/logger";
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
export const STORAGE_DEBUG_LOGS = runtimeConfig.app.debugLogs;

type StorageBootstrapStep = {
  name: string;
  run: () => Promise<void>;
};

const STORAGE_BOOTSTRAP_SLOW_STEP_MS = 1_000;

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
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {}

  public async init() {
    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.runInit();
    try {
      await this.initPromise;
      this.initialized = true;
    } finally {
      this.initPromise = null;
    }
  }

  private async runInit() {
    const startedAt = performance.now();
    const steps: StorageBootstrapStep[] = [
      { name: "users-table", run: () => this.ensureUsersTable() },
      { name: "imports-table", run: () => this.ensureImportsTable() },
      { name: "data-rows-table", run: () => this.ensureDataRowsTable() },
      { name: "user-activity-table", run: () => this.ensureUserActivityTable() },
      { name: "audit-logs-table", run: () => this.ensureAuditLogsTable() },
      { name: "mutation-idempotency-table", run: () => this.ensureMutationIdempotencyTable() },
      { name: "monitor-alert-history-table", run: () => this.ensureMonitorAlertHistoryTable() },
      { name: "collection-records-table", run: () => this.ensureCollectionRecordsTable() },
      { name: "collection-staff-nicknames-table", run: () => this.ensureCollectionStaffNicknamesTable() },
      { name: "collection-admin-groups-tables", run: () => this.ensureCollectionAdminGroupsTables() },
      { name: "collection-nickname-sessions-table", run: () => this.ensureCollectionNicknameSessionsTable() },
      {
        name: "collection-admin-visible-nicknames-table",
        run: () => this.ensureCollectionAdminVisibleNicknamesTable(),
      },
      { name: "collection-daily-tables", run: () => this.ensureCollectionDailyTables() },
      { name: "default-users-seed", run: () => this.seedDefaultUsers() },
      { name: "backups-table", run: () => this.ensureBackupsTable() },
      { name: "performance-indexes", run: () => this.ensurePerformanceIndexes() },
      { name: "banned-sessions-table", run: () => this.ensureBannedSessionsTable() },
      { name: "ai-tables", run: () => this.ensureAiTables() },
      { name: "spatial-tables", run: () => this.ensureSpatialTables() },
      { name: "category-rules-table", run: () => this.ensureCategoryRulesTable() },
      { name: "category-stats-table", run: () => this.ensureCategoryStatsTable() },
      { name: "settings-tables", run: () => this.ensureSettingsTables() },
    ];

    for (const step of steps) {
      await this.runInitStep(step);
    }

    logger.info("PostgreSQL storage bootstrap completed", {
      durationMs: Number((performance.now() - startedAt).toFixed(1)),
      stepCount: steps.length,
    });
  }

  private async runInitStep(step: StorageBootstrapStep) {
    const startedAt = performance.now();
    try {
      await step.run();
    } catch (error) {
      logger.error("PostgreSQL storage bootstrap step failed", {
        bootstrapStep: step.name,
        durationMs: Number((performance.now() - startedAt).toFixed(1)),
        error,
      });
      throw error;
    }

    const durationMs = Number((performance.now() - startedAt).toFixed(1));
    if (durationMs >= STORAGE_BOOTSTRAP_SLOW_STEP_MS) {
      logger.warn("PostgreSQL storage bootstrap step completed slowly", {
        bootstrapStep: step.name,
        durationMs,
        slowStepThresholdMs: STORAGE_BOOTSTRAP_SLOW_STEP_MS,
      });
    } else if (STORAGE_DEBUG_LOGS) {
      logger.info("PostgreSQL storage bootstrap step completed", {
        bootstrapStep: step.name,
        durationMs,
      });
    }
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
