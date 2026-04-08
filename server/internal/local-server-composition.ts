import type { Express, RequestHandler, Response } from "express";
import type { Server } from "http";
import type { WebSocket, WebSocketServer } from "ws";
import { getOllamaConfig } from "../ai-ollama";
import { createAuthGuards, type AuthenticatedRequest } from "../auth/guards";
import {
  DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
  parseBodyLimitToBytes,
} from "../config/body-limit";
import { runtimeConfig as environmentRuntimeConfig } from "../config/runtime";
import { createImportsController } from "../controllers/imports.controller";
import { createOperationsController } from "../controllers/operations.controller";
import { createSearchController } from "../controllers/search.controller";
import { createWebVitalsTelemetryController } from "../controllers/web-vitals-telemetry.controller";
import type { MaintenanceState } from "../config/system-settings";
import { pool } from "../db-postgres";
import { injectChaos, getIntelligenceExplainability } from "../intelligence";
import { logger } from "../lib/logger";
import { CollectionRollupRefreshNotificationSubscriber } from "../lib/collection-rollup-refresh-notification";
import { errorHandler } from "../middleware/error-handler";
import { createAuthRouteRateLimiters, searchRateLimiter } from "../middleware/rate-limit";
import { AnalyticsRepository } from "../repositories/analytics.repository";
import { AuditRepository } from "../repositories/audit.repository";
import { BackupJobRepository } from "../repositories/backup-job.repository";
import { BackupsRepository } from "../repositories/backups.repository";
import { ImportsRepository } from "../repositories/imports.repository";
import { MonitorAlertHistoryRepository } from "../repositories/monitor-alert-history.repository";
import { SearchRepository } from "../repositories/search.repository";
import { createAiController } from "../controllers/ai.controller";
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
import { AiChatService } from "../services/ai-chat.service";
import { AiIndexService } from "../services/ai-index.service";
import { AiIndexOperationsService } from "../services/ai-index-operations.service";
import { AiInteractionService } from "../services/ai-interaction.service";
import { AiSearchService } from "../services/ai-search.service";
import { AuditLogOperationsService } from "../services/audit-log-operations.service";
import { BackupJobQueueService } from "../services/backup-job-queue.service";
import { BackupOperationsService } from "../services/backup-operations.service";
import { CategoryStatsService } from "../services/category-stats.service";
import { CollectionRollupOperationsService } from "../services/collection-rollup-operations.service";
import { CollectionRollupRefreshQueueService } from "../services/collection-rollup-refresh-queue.service";
import { ImportAnalysisService } from "../services/import-analysis.service";
import { ImportsService } from "../services/imports.service";
import { OperationsAnalyticsService } from "../services/operations-analytics.service";
import { SearchService } from "../services/search.service";
import { WebVitalsTelemetryService } from "../services/web-vitals-telemetry.service";
import type { PostgresStorage } from "../storage-postgres";
import { createRuntimeWebSocketManager } from "../ws/runtime-manager";
import { parseBackupMetadataSafe } from "./backupMetadata";
import type { CircuitSnapshot } from "./circuitBreaker";
import { CircuitOpenError } from "./circuitBreaker";
import type { RuntimeSettings } from "./runtime-config-manager";
import type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
  WorkerControlState,
} from "./runtime-monitor-manager";
import { getStartupHealthSnapshot } from "./startup-health";

type AuthGuards = ReturnType<typeof createAuthGuards>;
type AsyncCircuitWrapper = <T>(fn: () => Promise<T>) => Promise<T>;
type RuntimeConfigRouteDeps = {
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  getMaintenanceStateCached: (force?: boolean) => Promise<MaintenanceState>;
  invalidateRuntimeSettingsCache: () => void;
  invalidateMaintenanceCache: () => void;
};
type LocalCircuitSnapshots = {
  ai: CircuitSnapshot;
  db: CircuitSnapshot;
  export: CircuitSnapshot;
};
type RuntimeMonitorRouteDeps = {
  computeInternalMonitorSnapshot: () => InternalMonitorSnapshot;
  buildInternalMonitorAlerts: (snapshot: InternalMonitorSnapshot) => InternalMonitorAlert[];
  getControlState: () => WorkerControlState;
  getDbProtection: () => boolean;
  getRequestRate: () => number;
  getLatencyP95: () => number;
  getLocalCircuitSnapshots: () => LocalCircuitSnapshots;
};
type WithAiConcurrencyGate = (
  route: "search" | "chat",
  handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>,
) => RequestHandler;

type CreateLocalServerCompositionOptions = {
  storage: PostgresStorage;
  wss: WebSocketServer;
  secret: string;
  withAiCircuit: AsyncCircuitWrapper;
  lowMemoryMode: boolean;
  defaultAiTimeoutMs: number;
  ollamaChat: typeof import("../ai-ollama").ollamaChat;
  ollamaEmbed: typeof import("../ai-ollama").ollamaEmbed;
};

export type LocalServerComposition = {
  storage: PostgresStorage;
  importsRepository: ImportsRepository;
  searchRepository: SearchRepository;
  auditRepository: AuditRepository;
  analyticsRepository: AnalyticsRepository;
  backupsRepository: BackupsRepository;
  importAnalysisService: ImportAnalysisService;
  aiSearchService: AiSearchService;
  categoryStatsService: CategoryStatsService;
  aiChatService: AiChatService;
  aiIndexService: AiIndexService;
  connectedClients: Map<string, WebSocket>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
  authenticateToken: AuthGuards["authenticateToken"];
  requireRole: AuthGuards["requireRole"];
  requireTabAccess: AuthGuards["requireTabAccess"];
  requireMonitorAccess: AuthGuards["requireMonitorAccess"];
  clearTabVisibilityCache: AuthGuards["clearTabVisibilityCache"];
};

type RegisterLocalServerRoutesOptions = {
  app: Express;
  server: Server;
  composition: LocalServerComposition;
  runtimeConfig: RuntimeConfigRouteDeps;
  runtimeMonitor: RuntimeMonitorRouteDeps;
  withAiConcurrencyGate: WithAiConcurrencyGate;
  withExportCircuit: AsyncCircuitWrapper;
  defaultAiTimeoutMs: number;
};

export function createLocalServerComposition(
  options: CreateLocalServerCompositionOptions,
): LocalServerComposition {
  const {
    storage,
    wss,
    secret,
    withAiCircuit,
    lowMemoryMode,
    defaultAiTimeoutMs,
    ollamaChat,
    ollamaEmbed,
  } = options;

  const importsRepository = new ImportsRepository();
  const searchRepository = new SearchRepository();
  const auditRepository = new AuditRepository();
  const analyticsRepository = new AnalyticsRepository();
  const backupsRepository = new BackupsRepository({
    ensureBackupsTable: () => storage.ensureBackupsReady(),
    parseBackupMetadataSafe,
  });
  const importAnalysisService = new ImportAnalysisService(importsRepository);
  const websocketManager = createRuntimeWebSocketManager({
    wss,
    storage,
    secret,
  });
  const authGuards = createAuthGuards({ storage, secret });
  const categoryStatsService = new CategoryStatsService(storage);
  const aiSearchService = new AiSearchService({
    storage,
    withAiCircuit,
    ollamaChat,
    ollamaEmbed,
    defaultAiTimeoutMs,
    lowMemoryMode,
  });
  const aiChatService = new AiChatService({
    storage,
    categoryStatsService,
    withAiCircuit,
    ollamaChat,
  });
  const aiIndexService = new AiIndexService({
    storage,
    ollamaEmbed,
  });

  return {
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
    connectedClients: websocketManager.connectedClients,
    broadcastWsMessage: websocketManager.broadcastWsMessage,
    authenticateToken: authGuards.authenticateToken,
    requireRole: authGuards.requireRole,
    requireTabAccess: authGuards.requireTabAccess,
    requireMonitorAccess: authGuards.requireMonitorAccess,
    clearTabVisibilityCache: authGuards.clearTabVisibilityCache,
  };
}

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
    listMonitorAlertHistory: (options) => monitorAlertHistoryRepository.listRecentPage(options),
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
    multipartMaxFileSizeBytes: importUploadLimitBytes,
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
