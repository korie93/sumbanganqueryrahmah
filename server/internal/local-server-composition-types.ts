import type { Express, RequestHandler, Response } from "express";
import type { Server } from "http";
import type { WebSocket } from "ws";
import { createAuthGuards, type AuthenticatedRequest } from "../auth/guards";
import type { MaintenanceState } from "../config/system-settings";
import type { AnalyticsRepository } from "../repositories/analytics.repository";
import type { AuditRepository } from "../repositories/audit.repository";
import type { BackupsRepository } from "../repositories/backups.repository";
import type { ImportsRepository } from "../repositories/imports.repository";
import type { SearchRepository } from "../repositories/search.repository";
import type { AiChatService } from "../services/ai-chat.service";
import type { AiIndexService } from "../services/ai-index.service";
import type { AiSearchService } from "../services/ai-search.service";
import type { CategoryStatsService } from "../services/category-stats.service";
import type { ImportAnalysisService } from "../services/import-analysis.service";
import type { PostgresStorage } from "../storage-postgres";
import type { CircuitSnapshot } from "./circuitBreaker";
import type { RuntimeSettings } from "./runtime-config-manager";
import type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
  WorkerControlState,
} from "./runtime-monitor-manager";

type AuthGuards = ReturnType<typeof createAuthGuards>;

export type AsyncCircuitWrapper = <T>(fn: () => Promise<T>) => Promise<T>;

export type RuntimeConfigRouteDeps = {
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  getMaintenanceStateCached: (force?: boolean) => Promise<MaintenanceState>;
  invalidateRuntimeSettingsCache: () => void;
  invalidateMaintenanceCache: () => void;
};

export type LocalCircuitSnapshots = {
  ai: CircuitSnapshot;
  db: CircuitSnapshot;
  export: CircuitSnapshot;
};

export type RuntimeMonitorRouteDeps = {
  computeInternalMonitorSnapshot: () => InternalMonitorSnapshot;
  buildInternalMonitorAlerts: (snapshot: InternalMonitorSnapshot) => InternalMonitorAlert[];
  getControlState: () => WorkerControlState;
  getDbProtection: () => boolean;
  getRequestRate: () => number;
  getLatencyP95: () => number;
  getLocalCircuitSnapshots: () => LocalCircuitSnapshots;
};

export type WithAiConcurrencyGate = (
  route: "search" | "chat",
  handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>,
) => RequestHandler;

export type CreateLocalServerCompositionOptions = {
  storage: PostgresStorage;
  wss: import("ws").WebSocketServer;
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
  stopTabVisibilityCacheSweep: AuthGuards["stopTabVisibilityCacheSweep"];
};

export type RegisterLocalServerRoutesOptions = {
  app: Express;
  server: Server;
  composition: LocalServerComposition;
  runtimeConfig: RuntimeConfigRouteDeps;
  runtimeMonitor: RuntimeMonitorRouteDeps;
  withAiConcurrencyGate: WithAiConcurrencyGate;
  withExportCircuit: AsyncCircuitWrapper;
  defaultAiTimeoutMs: number;
};
