import { getOllamaConfig } from "../ai-ollama";
import {
  DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
  parseBodyLimitToBytes,
} from "../config/body-limit";
import { runtimeConfig as environmentRuntimeConfig } from "../config/runtime";
import { createImportsController } from "../controllers/imports.controller";
import { createOperationsController } from "../controllers/operations.controller";
import { createSearchController } from "../controllers/search.controller";
import { createClientErrorTelemetryController } from "../controllers/client-error-telemetry.controller";
import { createWebVitalsTelemetryController } from "../controllers/web-vitals-telemetry.controller";
import { pool } from "../db-postgres";
import { injectChaos, getIntelligenceExplainability } from "../intelligence";
import { CollectionRollupRefreshNotificationSubscriber } from "../lib/collection-rollup-refresh-notification";
import { logger } from "../lib/logger";
import { errorHandler } from "../middleware/error-handler";
import {
  createAuthRouteRateLimiters,
  importsUploadRateLimiter,
  searchRateLimiter,
} from "../middleware/rate-limit";
import { MonitorAlertHistoryRepository } from "../repositories/monitor-alert-history.repository";
import { BackupJobRepository } from "../repositories/backup-job.repository";
import { registerActivityRoutes } from "../routes/activity.routes";
import { registerAiRoutes } from "../routes/ai.routes";
import { registerAuthRoutes } from "../routes/auth.routes";
import { registerCollectionRoutes } from "../routes/collection.routes";
import { registerImportRoutes } from "../routes/imports.routes";
import { registerOperationsRoutes } from "../routes/operations.routes";
import { registerSearchRoutes } from "../routes/search.routes";
import { registerSettingsRoutes } from "../routes/settings.routes";
import { registerSystemRoutes } from "../routes/system.routes";
import { registerTelemetryRoutes } from "../routes/telemetry.routes";
import { AiIndexOperationsService } from "../services/ai-index-operations.service";
import { AiInteractionService } from "../services/ai-interaction.service";
import { AuditLogOperationsService } from "../services/audit-log-operations.service";
import { BackupJobQueueService } from "../services/backup-job-queue.service";
import { BackupOperationsService } from "../services/backup-operations.service";
import { CollectionRollupOperationsService } from "../services/collection-rollup-operations.service";
import { CollectionRollupRefreshQueueService } from "../services/collection-rollup-refresh-queue.service";
import { ImportsService } from "../services/imports.service";
import { OperationsAnalyticsService } from "../services/operations-analytics.service";
import { SearchService } from "../services/search.service";
import { WebVitalsTelemetryService } from "../services/web-vitals-telemetry.service";
import { createAiController } from "../controllers/ai.controller";
import { CircuitOpenError } from "./circuitBreaker";
import { getStartupHealthSnapshot } from "./startup-health";
import type { RegisterLocalServerRoutesOptions } from "./local-server-composition-types";

export function registerLocalServerRoutes(options: RegisterLocalServerRoutesOptions) {
  const {
    app,
    server,
    composition,
    runtimeConfig,
    runtimeMonitor,
    withAiConcurrencyGate,
    withExportCircuit,
    defaultAiTimeoutMs,
  } = options;
  const {
    storage,
    importsRepository,
    searchRepository,
    auditRepository,
    analyticsRepository,
    backupsRepository,
    importAnalysisService,
    aiSearchService,
    categoryStatsService,
    aiChatService,
    aiIndexService,
    connectedClients,
    broadcastWsMessage,
    authenticateToken,
    requireRole,
    requireTabAccess,
    requireMonitorAccess,
    clearTabVisibilityCache,
  } = composition;
  const {
    getRuntimeSettingsCached,
    getMaintenanceStateCached,
    invalidateRuntimeSettingsCache,
    invalidateMaintenanceCache,
  } = runtimeConfig;
  const {
    computeInternalMonitorSnapshot,
    buildInternalMonitorAlerts,
    getControlState,
    getDbProtection,
    getRequestRate,
    getLatencyP95,
    getLocalCircuitSnapshots,
  } = runtimeMonitor;
  const importUploadLimitBytes = parseBodyLimitToBytes(
    environmentRuntimeConfig.app.bodyLimits.imports,
    DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
  );
  const authRouteRateLimiters = createAuthRouteRateLimiters();
  const backupOperationsService = new BackupOperationsService(
    storage,
    backupsRepository,
    withExportCircuit,
    (error) => error instanceof CircuitOpenError,
    {
      maxPayloadBytes: environmentRuntimeConfig.runtime.backupMaxPayloadBytes,
    },
  );
  const backupJobQueueService = new BackupJobQueueService({
    repository: new BackupJobRepository(),
    executeCreate: (params) => backupOperationsService.createBackup(params),
    executeRestore: (params) => backupOperationsService.restoreBackup(params),
    ensureReady: () => storage.ensureBackupsReady(),
  });
  void backupJobQueueService.start().catch((error) => {
    logger.error("Failed to start backup background job queue", { error });
  });
  const collectionRollupRefreshQueueService = new CollectionRollupRefreshQueueService({
    ensureReady: () => storage.ensureCollectionRecordsReady(),
    notificationSubscriber: new CollectionRollupRefreshNotificationSubscriber({
      reconnectDelayMs: environmentRuntimeConfig.runtime.collectionRollupListenReconnectMs,
    }),
  });
  void collectionRollupRefreshQueueService.start().catch((error) => {
    logger.error("Failed to start collection rollup refresh queue", { error });
  });
  server.once("close", () => {
    void collectionRollupRefreshQueueService.stop().catch((error) => {
      logger.warn("Failed to stop collection rollup refresh queue cleanly", { error });
    });
  });
  const collectionRollupOperationsService = new CollectionRollupOperationsService({
    ensureReady: () => storage.ensureCollectionRecordsReady(),
    queueService: collectionRollupRefreshQueueService,
  });
  const monitorAlertHistoryRepository = new MonitorAlertHistoryRepository();
  const webVitalsTelemetryService = new WebVitalsTelemetryService();
  const webVitalsTelemetryController = createWebVitalsTelemetryController({
    webVitalsTelemetryService,
  });
  const clientErrorTelemetryController = createClientErrorTelemetryController({
    enabled: environmentRuntimeConfig.observability.clientErrorTelemetryEnabled,
  });

  registerSystemRoutes(app, {
    authenticateToken,
    requireRole,
    requireMonitorAccess,
    getMaintenanceStateCached,
    computeInternalMonitorSnapshot,
    buildInternalMonitorAlerts,
    getControlState,
    getDbProtection,
    getRequestRate,
    getLatencyP95,
    getLocalCircuitSnapshots,
    getIntelligenceExplainability,
    injectChaos,
    getCollectionRollupQueueStatus: () => collectionRollupOperationsService.getStatus(),
    drainCollectionRollupQueue: () => collectionRollupOperationsService.drainQueueNow(),
    retryCollectionRollupFailures: () => collectionRollupOperationsService.retryFailedSlices(),
    autoHealCollectionRollupQueue: () => collectionRollupOperationsService.autoHealRunningSlices(),
    rebuildCollectionRollups: () => collectionRollupOperationsService.rebuildAllRollups(),
    listMonitorAlertHistory: (routeOptions) =>
      monitorAlertHistoryRepository.listRecentPage(routeOptions),
    deleteMonitorAlertHistoryOlderThan: (cutoffDate) =>
      monitorAlertHistoryRepository.deleteResolvedOlderThan(cutoffDate),
    getWebVitalsOverview: () => webVitalsTelemetryService.getOverview(),
    createAuditLog: (data) => storage.createAuditLog(data),
    checkDbConnectivity: async () => {
      try {
        const client = await pool.connect();
        client.release();
        return true;
      } catch {
        return false;
      }
    },
    getStartupHealthSnapshot,
  });

  registerAuthRoutes(app, {
    storage,
    authenticateToken,
    requireRole,
    connectedClients,
    rateLimiters: authRouteRateLimiters,
  });

  registerTelemetryRoutes(app, {
    reportWebVital: webVitalsTelemetryController.report,
    reportClientError: clientErrorTelemetryController.report,
  });

  registerActivityRoutes(app, {
    storage,
    authenticateToken,
    requireRole,
    requireTabAccess,
    connectedClients,
    rateLimiters: {
      adminAction: authRouteRateLimiters.adminAction,
    },
  });

  registerImportRoutes(app, {
    importsController: createImportsController({
      importsService: new ImportsService(storage, importsRepository, importAnalysisService),
      getRuntimeSettingsCached,
      isDbProtected: getDbProtection,
      analysisRequestTimeoutMs: environmentRuntimeConfig.runtime.importAnalysisTimeoutMs,
    }),
    authenticateToken,
    requireRole,
    requireTabAccess,
    searchRateLimiter,
    importsUploadRateLimiter,
    multipartMaxFileSizeBytes: importUploadLimitBytes,
    multipartPerUserQuotaBytes: environmentRuntimeConfig.runtime.importPerUserActiveUploadBytes,
  });

  registerSearchRoutes(app, {
    searchController: createSearchController({
      searchService: new SearchService(searchRepository),
      getRuntimeSettingsCached,
      isDbProtected: getDbProtection,
    }),
    authenticateToken,
    searchRateLimiter,
  });

  registerAiRoutes(app, {
    aiController: createAiController({
      aiInteractionService: new AiInteractionService({
        createAuditLog: (data) => storage.createAuditLog(data),
        getRuntimeSettingsCached,
        aiSearchService,
        categoryStatsService,
        aiChatService,
        getOllamaConfig,
        defaultAiTimeoutMs,
      }),
      aiIndexOperationsService: new AiIndexOperationsService({
        getRuntimeSettingsCached,
        aiIndexService,
      }),
    }),
    authenticateToken,
    requireRole,
    withAiConcurrencyGate,
  });

  registerSettingsRoutes(app, {
    storage,
    authenticateToken,
    requireRole,
    requireTabAccess,
    clearTabVisibilityCache,
    invalidateRuntimeSettingsCache,
    invalidateMaintenanceCache,
    getMaintenanceStateCached,
    broadcastWsMessage,
    importUploadLimitBytes,
  });

  registerOperationsRoutes(app, {
    operationsController: createOperationsController({
      auditLogOperationsService: new AuditLogOperationsService(storage, auditRepository),
      backupOperationsService,
      backupJobQueueService,
      operationsAnalyticsService: new OperationsAnalyticsService(analyticsRepository),
      connectedClients,
      requestTimeouts: {
        backupOperationMs: environmentRuntimeConfig.runtime.backupOperationTimeoutMs,
      },
    }),
    authenticateToken,
    requireRole,
    requireTabAccess,
  });

  registerCollectionRoutes(app, {
    storage,
    authenticateToken,
    requireRole,
    requireTabAccess,
  });

  app.use(errorHandler);
}
