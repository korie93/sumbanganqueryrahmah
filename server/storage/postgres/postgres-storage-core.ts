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
import { verifyRuntimeSchemaReady } from "../../internal/runtime-schema-verification";
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

export type StorageBootstrapStep = {
  name: string;
  run: () => Promise<void>;
};

export type StorageBootstrapStepGroup = {
  name: string;
  steps: StorageBootstrapStep[];
};

const STORAGE_BOOTSTRAP_SLOW_STEP_MS = 1_000;

type PostgresStorageBootstrapHandlers = {
  ensureUsersTable: () => Promise<void>;
  ensureImportsTable: () => Promise<void>;
  ensureDataRowsTable: () => Promise<void>;
  ensureUserActivityTable: () => Promise<void>;
  ensureAuditLogsTable: () => Promise<void>;
  ensureMutationIdempotencyTable: () => Promise<void>;
  ensureMonitorAlertHistoryTable: () => Promise<void>;
  ensureCollectionRecordsTable: () => Promise<void>;
  ensureCollectionStaffNicknamesTable: () => Promise<void>;
  ensureCollectionAdminGroupsTables: () => Promise<void>;
  ensureCollectionNicknameSessionsTable: () => Promise<void>;
  ensureCollectionAdminVisibleNicknamesTable: () => Promise<void>;
  ensureCollectionDailyTables: () => Promise<void>;
  seedDefaultUsers: () => Promise<void>;
  ensureBackupsTable: () => Promise<void>;
  ensurePerformanceIndexes: () => Promise<void>;
  ensureBannedSessionsTable: () => Promise<void>;
  ensureAiTables: () => Promise<void>;
  ensureSpatialTables: () => Promise<void>;
  ensureCategoryRulesTable: () => Promise<void>;
  ensureCategoryStatsTable: () => Promise<void>;
  ensureSettingsTables: () => Promise<void>;
};

export function buildPostgresStorageBootstrapPlan(
  handlers: PostgresStorageBootstrapHandlers,
): Array<StorageBootstrapStep | StorageBootstrapStepGroup> {
  return [
    { name: "users-table", run: handlers.ensureUsersTable },
    {
      name: "core-schema-primitives",
      steps: [
        { name: "imports-table", run: handlers.ensureImportsTable },
        { name: "data-rows-table", run: handlers.ensureDataRowsTable },
        { name: "user-activity-table", run: handlers.ensureUserActivityTable },
        { name: "audit-logs-table", run: handlers.ensureAuditLogsTable },
        { name: "mutation-idempotency-table", run: handlers.ensureMutationIdempotencyTable },
        { name: "monitor-alert-history-table", run: handlers.ensureMonitorAlertHistoryTable },
      ],
    },
    { name: "collection-records-table", run: handlers.ensureCollectionRecordsTable },
    { name: "collection-staff-nicknames-table", run: handlers.ensureCollectionStaffNicknamesTable },
    { name: "collection-admin-groups-tables", run: handlers.ensureCollectionAdminGroupsTables },
    { name: "collection-nickname-sessions-table", run: handlers.ensureCollectionNicknameSessionsTable },
    {
      name: "collection-admin-visible-nicknames-table",
      run: handlers.ensureCollectionAdminVisibleNicknamesTable,
    },
    { name: "collection-daily-tables", run: handlers.ensureCollectionDailyTables },
    { name: "default-users-seed", run: handlers.seedDefaultUsers },
    { name: "backups-table", run: handlers.ensureBackupsTable },
    { name: "performance-indexes", run: handlers.ensurePerformanceIndexes },
    {
      name: "supporting-schema",
      steps: [
        { name: "banned-sessions-table", run: handlers.ensureBannedSessionsTable },
        { name: "ai-tables", run: handlers.ensureAiTables },
        { name: "spatial-tables", run: handlers.ensureSpatialTables },
        { name: "category-rules-table", run: handlers.ensureCategoryRulesTable },
        { name: "category-stats-table", run: handlers.ensureCategoryStatsTable },
        { name: "settings-tables", run: handlers.ensureSettingsTables },
      ],
    },
  ];
}

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
    const databaseBootstrapMode = runtimeConfig.bootstrap.databaseMode;
    if (databaseBootstrapMode === "migration") {
      logger.info("PostgreSQL runtime schema verification starting", {
        databaseBootstrapMode,
        productionLike: runtimeConfig.app.isProductionLike,
        schemaCoupledRuntimeBootstrap: false,
      });
      await verifyRuntimeSchemaReady();
      logger.info("PostgreSQL runtime schema verification completed", {
        durationMs: Number((performance.now() - startedAt).toFixed(1)),
      });
      return;
    }

    if (runtimeConfig.app.isProductionLike) {
      logger.warn("PostgreSQL runtime bootstrap is enabled on a production-like host", {
        databaseBootstrapMode,
        productionLike: true,
        schemaCoupledRuntimeBootstrap: true,
        migrationFirstRecommended: true,
      });
    }

    const steps = buildPostgresStorageBootstrapPlan({
      ensureUsersTable: () => this.ensureUsersTable(),
      ensureImportsTable: () => this.ensureImportsTable(),
      ensureDataRowsTable: () => this.ensureDataRowsTable(),
      ensureUserActivityTable: () => this.ensureUserActivityTable(),
      ensureAuditLogsTable: () => this.ensureAuditLogsTable(),
      ensureMutationIdempotencyTable: () => this.ensureMutationIdempotencyTable(),
      ensureMonitorAlertHistoryTable: () => this.ensureMonitorAlertHistoryTable(),
      ensureCollectionRecordsTable: () => this.ensureCollectionRecordsTable(),
      ensureCollectionStaffNicknamesTable: () => this.ensureCollectionStaffNicknamesTable(),
      ensureCollectionAdminGroupsTables: () => this.ensureCollectionAdminGroupsTables(),
      ensureCollectionNicknameSessionsTable: () => this.ensureCollectionNicknameSessionsTable(),
      ensureCollectionAdminVisibleNicknamesTable: () => this.ensureCollectionAdminVisibleNicknamesTable(),
      ensureCollectionDailyTables: () => this.ensureCollectionDailyTables(),
      seedDefaultUsers: () => this.seedDefaultUsers(),
      ensureBackupsTable: () => this.ensureBackupsTable(),
      ensurePerformanceIndexes: () => this.ensurePerformanceIndexes(),
      ensureBannedSessionsTable: () => this.ensureBannedSessionsTable(),
      ensureAiTables: () => this.ensureAiTables(),
      ensureSpatialTables: () => this.ensureSpatialTables(),
      ensureCategoryRulesTable: () => this.ensureCategoryRulesTable(),
      ensureCategoryStatsTable: () => this.ensureCategoryStatsTable(),
      ensureSettingsTables: () => this.ensureSettingsTables(),
    });
    const stepCount = steps.reduce(
      (count, step) => count + ("steps" in step ? step.steps.length : 1),
      0,
    );

    logger.info("PostgreSQL storage bootstrap starting", {
      databaseBootstrapMode,
      productionLike: runtimeConfig.app.isProductionLike,
      schemaCoupledRuntimeBootstrap: true,
      stepCount,
    });

    for (const step of steps) {
      if ("steps" in step) {
        await Promise.all(step.steps.map((groupStep) => this.runInitStep(groupStep)));
        continue;
      }

      await this.runInitStep(step);
    }

    logger.info("PostgreSQL storage bootstrap completed", {
      durationMs: Number((performance.now() - startedAt).toFixed(1)),
      stepCount,
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
        ...(runtimeConfig.app.isProductionLike
          ? {
            hint: "If this is a schema or permissions failure, run the approved database migrations before retrying startup.",
          }
          : {}),
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

  private async verifyProductionTablesOrBootstrap(
    requiredTables: readonly string[],
    bootstrap: () => Promise<void>,
  ) {
    if (runtimeConfig.bootstrap.databaseMode === "migration") {
      await verifyRuntimeSchemaReady(undefined, requiredTables);
      return;
    }

    await bootstrap();
  }

  protected async ensureUsersTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["users", "account_activation_tokens", "password_reset_requests"],
      () => this.usersBootstrap.ensureTable(),
    );
  }

  protected async ensureImportsTable() {
    await this.verifyProductionTablesOrBootstrap(["imports"], () => this.coreSchemaBootstrap.ensureImportsTable());
  }

  protected async ensureDataRowsTable() {
    await this.verifyProductionTablesOrBootstrap(["data_rows"], () => this.coreSchemaBootstrap.ensureDataRowsTable());
  }

  protected async ensureUserActivityTable() {
    await this.verifyProductionTablesOrBootstrap(["user_activity"], () => this.coreSchemaBootstrap.ensureUserActivityTable());
  }

  protected async ensureAuditLogsTable() {
    await this.verifyProductionTablesOrBootstrap(["audit_logs"], () => this.coreSchemaBootstrap.ensureAuditLogsTable());
  }

  protected async ensureMutationIdempotencyTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["mutation_idempotency_keys"],
      () => this.coreSchemaBootstrap.ensureMutationIdempotencyTable(),
    );
  }

  protected async ensureMonitorAlertHistoryTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["monitor_alert_incidents"],
      () => this.coreSchemaBootstrap.ensureMonitorAlertHistoryTable(),
    );
  }

  protected async ensureCollectionRecordsTable() {
    await this.verifyProductionTablesOrBootstrap(
      [
        "collection_records",
        "collection_record_receipts",
        "collection_record_daily_rollups",
        "collection_record_monthly_rollups",
        "collection_record_daily_rollup_refresh_queue",
      ],
      () => this.collectionBootstrap.ensureRecordsTable(),
    );
  }

  protected async ensureCollectionStaffNicknamesTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["collection_staff_nicknames"],
      () => this.collectionBootstrap.ensureStaffNicknamesTable(),
    );
  }

  protected async ensureCollectionAdminGroupsTables() {
    await this.verifyProductionTablesOrBootstrap(
      ["admin_groups", "admin_group_members"],
      () => this.collectionBootstrap.ensureAdminGroupsTables(),
    );
  }

  protected async ensureCollectionNicknameSessionsTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["collection_nickname_sessions"],
      () => this.collectionBootstrap.ensureNicknameSessionsTable(),
    );
  }

  protected async ensureCollectionAdminVisibleNicknamesTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["admin_visible_nicknames"],
      () => this.collectionBootstrap.ensureAdminVisibleNicknamesTable(),
    );
  }

  protected async ensureCollectionDailyTables() {
    await this.verifyProductionTablesOrBootstrap(
      ["collection_daily_targets", "collection_daily_calendar"],
      () => this.collectionBootstrap.ensureDailyTables(),
    );
  }

  protected async ensurePerformanceIndexes() {
    await this.verifyProductionTablesOrBootstrap([], () => this.coreSchemaBootstrap.ensurePerformanceIndexes());
  }

  protected async ensureBannedSessionsTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["banned_sessions"],
      () => this.coreSchemaBootstrap.ensureBannedSessionsTable(),
    );
  }

  protected async ensureAiTables() {
    await this.verifyProductionTablesOrBootstrap(
      ["data_embeddings", "ai_conversations", "ai_messages"],
      () => this.aiBootstrap.ensureAiTables(),
    );
  }

  protected async ensureCategoryStatsTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["ai_category_stats"],
      () => this.aiBootstrap.ensureCategoryStatsTable(),
    );
  }

  protected async ensureCategoryRulesTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["ai_category_rules"],
      () => this.aiBootstrap.ensureCategoryRulesTable(),
    );
  }

  protected async ensureSettingsTables() {
    await this.verifyProductionTablesOrBootstrap(
      [
        "setting_categories",
        "system_settings",
        "setting_options",
        "role_setting_permissions",
        "setting_versions",
        "feature_flags",
      ],
      () => this.settingsBootstrap.ensureTables(),
    );
  }

  protected async ensureSpatialTables() {
    await this.verifyProductionTablesOrBootstrap(
      ["aeon_branches", "aeon_branch_postcodes"],
      () => this.spatialBootstrap.ensureTables(),
    );
  }

  protected async ensureBackupsTable() {
    await this.verifyProductionTablesOrBootstrap(
      ["backups", "backup_jobs", "backup_payload_chunks"],
      () => this.backupsBootstrap.ensureTable(),
    );
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
