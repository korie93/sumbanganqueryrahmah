import { logger } from "../lib/logger";
import {
  ensureCoreAuditLogsTable,
  ensureCoreBannedSessionsTable,
  ensureCoreUserActivityTable,
} from "./core-schema-bootstrap-activity";
import {
  ensureCoreDataRowsTable,
  ensureCoreImportsTable,
} from "./core-schema-bootstrap-imports";
import {
  ensureCoreMonitorAlertHistoryTable,
  ensureCoreMutationIdempotencyTable,
} from "./core-schema-bootstrap-runtime";
import {
  ensureCorePerformanceIndexes,
  ensureCorePerformanceTrigramIndexes,
  runCoreSchemaBootstrapTask,
  type CoreSchemaBootstrapTaskState,
  type CoreSchemaSqlExecutor,
} from "./core-schema-bootstrap-utils";

type CoreSchemaBootstrapTask = (database: CoreSchemaSqlExecutor) => Promise<void>;

export class CoreSchemaBootstrap {
  private readonly importsState: CoreSchemaBootstrapTaskState = { ready: false, initPromise: null };
  private readonly dataRowsState: CoreSchemaBootstrapTaskState = { ready: false, initPromise: null };
  private readonly userActivityState: CoreSchemaBootstrapTaskState = { ready: false, initPromise: null };
  private readonly auditLogsState: CoreSchemaBootstrapTaskState = { ready: false, initPromise: null };
  private readonly mutationIdempotencyState: CoreSchemaBootstrapTaskState = { ready: false, initPromise: null };
  private readonly monitorAlertHistoryState: CoreSchemaBootstrapTaskState = {
    ready: false,
    initPromise: null,
  };
  private readonly performanceIndexesState: CoreSchemaBootstrapTaskState = {
    ready: false,
    initPromise: null,
  };
  private readonly bannedSessionsState: CoreSchemaBootstrapTaskState = { ready: false, initPromise: null };

  async ensureImportsTable(): Promise<void> {
    await this.runTask(
      this.importsState,
      "Failed to ensure imports table",
      ensureCoreImportsTable,
    );
  }

  async ensureDataRowsTable(): Promise<void> {
    await this.runTask(
      this.dataRowsState,
      "Failed to ensure data rows table",
      ensureCoreDataRowsTable,
    );
  }

  async ensureUserActivityTable(): Promise<void> {
    await this.runTask(
      this.userActivityState,
      "Failed to ensure user activity table",
      ensureCoreUserActivityTable,
    );
  }

  async ensureAuditLogsTable(): Promise<void> {
    await this.runTask(
      this.auditLogsState,
      "Failed to ensure audit logs table",
      ensureCoreAuditLogsTable,
    );
  }

  async ensureMutationIdempotencyTable(): Promise<void> {
    await this.runTask(
      this.mutationIdempotencyState,
      "Failed to ensure mutation idempotency table",
      ensureCoreMutationIdempotencyTable,
    );
  }

  async ensureMonitorAlertHistoryTable(): Promise<void> {
    await this.runTask(
      this.monitorAlertHistoryState,
      "Failed to ensure monitor alert incidents table",
      ensureCoreMonitorAlertHistoryTable,
    );
  }

  async ensurePerformanceIndexes(): Promise<void> {
    await this.runTask(
      this.performanceIndexesState,
      "Failed to ensure performance indexes",
      async (database) => {
        await ensureCorePerformanceIndexes(database);
        try {
          await ensureCorePerformanceTrigramIndexes(database);
        } catch (err: any) {
          logger.warn("pg_trgm is not available; skipping trigram index creation", { error: err });
        }
      },
    );
  }

  async ensureBannedSessionsTable(): Promise<void> {
    await runCoreSchemaBootstrapTask(
      this.bannedSessionsState,
      ensureCoreBannedSessionsTable,
      {
        errorMessage: "Failed to ensure banned sessions table",
        rethrowError: false,
      },
    );
  }

  private async runTask(
    state: CoreSchemaBootstrapTaskState,
    errorMessage: string,
    task: CoreSchemaBootstrapTask,
  ): Promise<void> {
    await runCoreSchemaBootstrapTask(state, task, { errorMessage });
  }
}
