import { createAuthGuards } from "../auth/guards";
import { initializeDummyBcryptHash } from "../auth/passwords";
import { ImportsRepository } from "../repositories/imports.repository";
import { SearchRepository } from "../repositories/search.repository";
import { AuditRepository } from "../repositories/audit.repository";
import { AnalyticsRepository } from "../repositories/analytics.repository";
import { BackupsRepository } from "../repositories/backups.repository";
import { CategoryStatsService } from "../services/category-stats.service";
import { ImportAnalysisService } from "../services/import-analysis.service";
import { AiSearchService } from "../services/ai-search.service";
import { AiChatService } from "../services/ai-chat.service";
import { AiIndexService } from "../services/ai-index.service";
import { createRuntimeWebSocketManager } from "../ws/runtime-manager";
import { runtimeConfig } from "../config/runtime";
import { logger } from "../lib/logger";
import { parseBackupMetadataSafe } from "./backupMetadata";
import type {
  CreateLocalServerCompositionOptions,
  LocalServerComposition,
} from "./local-server-composition-types";

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
    acceptWebSocketConnections,
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
    trustForwardedHeaders: runtimeConfig.app.trustedProxies.length > 0,
    ...(acceptWebSocketConnections ? { acceptConnections: acceptWebSocketConnections } : {}),
  });
  const authGuards = createAuthGuards({ storage, secret });
  void initializeDummyBcryptHash().catch((error: unknown) => {
    logger.error("Failed to initialize dummy bcrypt hash for timing-safe password checks", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });
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
    stopActivityUpdateCacheSweep: authGuards.stopActivityUpdateCacheSweep,
    stopTabVisibilityCacheSweep: authGuards.stopTabVisibilityCacheSweep,
  };
}
