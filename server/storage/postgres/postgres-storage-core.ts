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
