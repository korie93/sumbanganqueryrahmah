import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { PostgresStorage } from "./storage-postgres";
import { pool } from "./db-postgres";
import { StringDecoder } from "string_decoder";
import { searchRateLimiter } from "./middleware/rate-limit";
import { ollamaChat, ollamaEmbed, getOllamaConfig } from "./ai-ollama";
import { CircuitOpenError } from "./internal/circuitBreaker";
import { registerFrontendStatic } from "./internal/frontend-static";
import { startIdleSessionSweeper } from "./internal/idle-session-sweeper";
import { createRuntimeConfigManager } from "./internal/runtime-config-manager";
import { createRuntimeMonitorManager } from "./internal/runtime-monitor-manager";
import { wrapAsyncPrototypeMethods } from "./internal/wrapAsyncPrototypeMethods";
import { evaluateSystem, getIntelligenceExplainability, injectChaos } from "./intelligence";
import { getSessionSecret } from "./config/security";
import { createAuthGuards, type AuthenticatedRequest } from "./auth/guards";
import { errorHandler } from "./middleware/error-handler";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerActivityRoutes } from "./routes/activity.routes";
import { registerImportRoutes } from "./routes/imports.routes";
import { registerSearchRoutes } from "./routes/search.routes";
import { registerAiRoutes } from "./routes/ai.routes";
import { registerSystemRoutes } from "./routes/system.routes";
import { registerSettingsRoutes } from "./routes/settings.routes";
import { registerOperationsRoutes } from "./routes/operations.routes";
import { registerCollectionRoutes } from "./routes/collection.routes";
import { ImportsRepository } from "./repositories/imports.repository";
import { SearchRepository } from "./repositories/search.repository";
import { AuditRepository } from "./repositories/audit.repository";
import { AnalyticsRepository } from "./repositories/analytics.repository";
import { BackupsRepository } from "./repositories/backups.repository";
import { AiChatService } from "./services/ai-chat.service";
import { AiIndexService } from "./services/ai-index.service";
import { AiSearchService } from "./services/ai-search.service";
import { CategoryStatsService } from "./services/category-stats.service";
import { ImportAnalysisService } from "./services/import-analysis.service";
import { createRuntimeWebSocketManager } from "./ws/runtime-manager";

const storage = new PostgresStorage();
const importsRepository = new ImportsRepository();
const searchRepository = new SearchRepository();
const auditRepository = new AuditRepository();
const analyticsRepository = new AnalyticsRepository();
const backupsRepository = new BackupsRepository({
  ensureBackupsTable: () => storage.ensureBackupsReady(),
  parseBackupMetadataSafe: (raw) => storage.parseBackupMetadata(raw),
});
const importAnalysisService = new ImportAnalysisService(importsRepository);
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
let startupFatalReason: string | null = null;

function notifyMasterFatalStartup(reason: string, details?: string) {
  if (startupFatalReason) return;
  startupFatalReason = reason;

  if (typeof (process as any).send === "function") {
    try {
      (process as any).send({
        type: "worker-fatal",
        payload: { reason, details: details || "" },
      });
    } catch {
      // no-op
    }
  }
}

wss.on("error", (err: any) => {
  const code = String(err?.code || "");
  if (code === "EADDRINUSE") {
    notifyMasterFatalStartup("EADDRINUSE", "WebSocket server failed to bind address");
    console.error("âŒ WebSocket startup failed: port already in use.");
    setTimeout(() => process.exit(98), 10).unref();
    return;
  }
  console.error("âŒ WebSocket server error:", err);
});

const JWT_SECRET = getSessionSecret();
const websocketManager = createRuntimeWebSocketManager({
  wss,
  storage,
  secret: JWT_SECRET,
});
const { connectedClients, broadcastWsMessage } = websocketManager;
const modularAuthGuards = createAuthGuards({ storage, secret: JWT_SECRET });
const modularAuthenticateToken = modularAuthGuards.authenticateToken;
const modularRequireRole = modularAuthGuards.requireRole;
const modularRequireTabAccess = modularAuthGuards.requireTabAccess;
const modularRequireMonitorAccess = modularAuthGuards.requireMonitorAccess;
const clearModularTabVisibilityCache = modularAuthGuards.clearTabVisibilityCache;
const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
const DEFAULT_WS_IDLE_MINUTES = 3;
const DEFAULT_AI_TIMEOUT_MS = 6000;
const DEFAULT_BODY_LIMIT = "2mb";
const IMPORT_BODY_LIMIT = process.env.IMPORT_BODY_LIMIT || "50mb";
const COLLECTION_BODY_LIMIT = process.env.COLLECTION_BODY_LIMIT || "8mb";
const UPLOADS_ROOT_DIR = path.resolve(process.cwd(), "uploads");
const PG_POOL_WARN_COOLDOWN_MS = 60_000;
const AI_PRECOMPUTE_ON_START = String(process.env.AI_PRECOMPUTE_ON_START || "0") === "1";
const API_DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
const LOW_MEMORY_MODE = String(process.env.SQR_LOW_MEMORY_MODE ?? "1") === "1";
const AI_GATE_GLOBAL_LIMIT = Math.max(1, Number(process.env.AI_GATE_GLOBAL_LIMIT ?? "4"));
const AI_GATE_QUEUE_LIMIT = Math.max(0, Number(process.env.AI_GATE_QUEUE_LIMIT ?? "20"));
const AI_GATE_QUEUE_WAIT_MS = Math.max(1000, Number(process.env.AI_GATE_QUEUE_WAIT_MS ?? "12000"));
const AI_GATE_ROLE_LIMITS = {
  user: Math.max(1, Number(process.env.AI_GATE_USER_LIMIT ?? "2")),
  admin: Math.max(1, Number(process.env.AI_GATE_ADMIN_LIMIT ?? "1")),
  superuser: Math.max(1, Number(process.env.AI_GATE_SUPERUSER_LIMIT ?? "1")),
} as const;
const AI_LATENCY_STALE_AFTER_MS = Math.max(5_000, Number(process.env.AI_LATENCY_STALE_AFTER_MS ?? "20000"));
const AI_LATENCY_DECAY_HALF_LIFE_MS = Math.max(5_000, Number(process.env.AI_LATENCY_DECAY_HALF_LIFE_MS ?? "30000"));
const MAINTENANCE_CACHE_TTL_MS = 3000;
const RUNTIME_SETTINGS_CACHE_TTL_MS = 3000;
const runtimeMonitorManager = createRuntimeMonitorManager({
  pool,
  apiDebugLogs: API_DEBUG_LOGS,
  lowMemoryMode: LOW_MEMORY_MODE,
  pgPoolWarnCooldownMs: PG_POOL_WARN_COOLDOWN_MS,
  aiLatencyStaleAfterMs: AI_LATENCY_STALE_AFTER_MS,
  aiLatencyDecayHalfLifeMs: AI_LATENCY_DECAY_HALF_LIFE_MS,
  getSearchQueueLength: () => getSearchQueueLength(),
  evaluateSystem,
});
const {
  attachGcObserver,
  attachProcessMessageHandlers,
  buildInternalMonitorAlerts,
  computeInternalMonitorSnapshot,
  getControlState,
  getDbProtection,
  getLatencyP95,
  getLocalCircuitSnapshots,
  getRequestRate,
  recordRequestFinished,
  recordRequestStarted,
  startRuntimeLoops,
  withAiCircuit,
  withDbCircuit,
  withExportCircuit,
} = runtimeMonitorManager;

const DB_METHOD_WRAP_EXCLUDE = new Set<string>([
  "constructor",
]);

wrapAsyncPrototypeMethods(storage, {
  exclude: DB_METHOD_WRAP_EXCLUDE,
  wrap: withDbCircuit,
});
const aiSearchService = new AiSearchService({
  storage,
  withAiCircuit,
  ollamaChat,
  ollamaEmbed,
  defaultAiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
  lowMemoryMode: LOW_MEMORY_MODE,
});
const categoryStatsService = new CategoryStatsService(storage);
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
attachGcObserver();

function parseBrowser(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown";

  const ua = userAgent;
  const uaLower = ua.toLowerCase();

  const extractVersion = (pattern: RegExp): string => {
    const match = ua.match(pattern);
    if (match && match[1]) {
      const parts = match[1].split('.');
      return parts[0];
    }
    return "";
  };

  if (uaLower.includes("edg/")) {
    const ver = extractVersion(/Edg\/(\d+[\d.]*)/i);
    return ver ? `Edge ${ver}` : "Edge";
  }
  if (uaLower.includes("edge/")) {
    const ver = extractVersion(/Edge\/(\d+[\d.]*)/i);
    return ver ? `Edge ${ver}` : "Edge";
  }
  if (uaLower.includes("opr/")) {
    const ver = extractVersion(/OPR\/(\d+[\d.]*)/i);
    return ver ? `Opera ${ver}` : "Opera";
  }
  if (uaLower.includes("opera/")) {
    const ver = extractVersion(/Opera\/(\d+[\d.]*)/i);
    return ver ? `Opera ${ver}` : "Opera";
  }
  if (uaLower.includes("brave")) {
    const ver = extractVersion(/Brave\/(\d+[\d.]*)/i) || extractVersion(/Chrome\/(\d+[\d.]*)/i);
    return ver ? `Brave ${ver}` : "Brave";
  }
  if (uaLower.includes("duckduckgo")) {
    const ver = extractVersion(/DuckDuckGo\/(\d+[\d.]*)/i);
    return ver ? `DuckDuckGo ${ver}` : "DuckDuckGo";
  }
  if (uaLower.includes("vivaldi")) {
    const ver = extractVersion(/Vivaldi\/(\d+[\d.]*)/i);
    return ver ? `Vivaldi ${ver}` : "Vivaldi";
  }
  if (uaLower.includes("firefox/") || uaLower.includes("fxios/")) {
    const ver = extractVersion(/Firefox\/(\d+[\d.]*)/i) || extractVersion(/FxiOS\/(\d+[\d.]*)/i);
    return ver ? `Firefox ${ver}` : "Firefox";
  }
  if (uaLower.includes("safari/") && !uaLower.includes("chrome/") && !uaLower.includes("chromium/")) {
    const ver = extractVersion(/Version\/(\d+[\d.]*)/i);
    return ver ? `Safari ${ver}` : "Safari";
  }
  if (uaLower.includes("chrome/") || uaLower.includes("crios/") || uaLower.includes("chromium/")) {
    const ver = extractVersion(/Chrome\/(\d+[\d.]*)/i) || extractVersion(/CriOS\/(\d+[\d.]*)/i);
    return ver ? `Chrome ${ver}` : "Chrome";
  }
  if (uaLower.includes("msie") || uaLower.includes("trident/")) {
    const ver = extractVersion(/MSIE (\d+[\d.]*)/i) || extractVersion(/rv:(\d+[\d.]*)/i);
    return ver ? `Internet Explorer ${ver}` : "Internet Explorer";
  }

  return "Unknown";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isHeavyRoute(pathname: string): boolean {
  return pathname.startsWith("/api/ai/")
    || pathname.startsWith("/api/imports")
    || pathname.startsWith("/api/search/advanced")
    || pathname.startsWith("/api/backups");
}

function getSearchQueueLength(): number {
  const map = (global as any).__searchInflightMap as Map<string, Promise<unknown>> | undefined;
  return map?.size ?? 0;
}
const adaptiveRateState = new Map<string, { count: number; resetAt: number }>();

function resolveAdaptiveRateBucket(req: Request): {
  bucketKey: string;
  dynamicLimit: number;
} {
  const controlState = getControlState();
  const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const method = String(req.method || "GET").toUpperCase();
  const path = req.path || "/";

  let bucketScope = "api";
  let baseLimit = 40;
  let minLimit = 8;

  if (path.startsWith("/api/ai/")) {
    bucketScope = "ai";
    baseLimit = 14;
    minLimit = 4;
  } else if (path.startsWith("/api/activity/heartbeat")) {
    // Keep heartbeat resilient so it does not starve normal API calls.
    bucketScope = "heartbeat";
    baseLimit = 120;
    minLimit = 20;
  } else if (
    method === "GET" &&
    (path.startsWith("/api/collection/nicknames") || path.startsWith("/api/collection/admin-groups"))
  ) {
    // Lightweight metadata endpoints used by Collection Report management UI.
    bucketScope = "collection-meta";
    baseLimit = 120;
    minLimit = 24;
  }

  const modePenalty = controlState.mode === "PROTECTION" ? 0.5 : controlState.mode === "DEGRADED" ? 0.75 : 1;
  const throttle = clamp(controlState.throttleFactor || 1, 0.2, 1.2);
  const dynamicLimit = Math.max(minLimit, Math.floor(baseLimit * modePenalty * throttle));
  return { bucketKey: `${ip}:${bucketScope}`, dynamicLimit };
}

function adaptiveRateLimit(req: Request, res: Response, next: NextFunction) {
  const controlState = getControlState();
  if (!req.path.startsWith("/api/")) return next();
  const windowMs = 10_000;
  const now = Date.now();
  const { bucketKey, dynamicLimit } = resolveAdaptiveRateBucket(req);
  const bucket = adaptiveRateState.get(bucketKey);
  if (!bucket || now >= bucket.resetAt) {
    adaptiveRateState.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > dynamicLimit) {
    return res.status(429).json({
      message: "Too many requests under current system load.",
      limit: dynamicLimit,
      retryAfterMs: Math.max(0, bucket.resetAt - now),
      mode: controlState.mode,
    });
  }
  return next();
}

function systemProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  const controlState = getControlState();
  if (!req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/api/health") || req.path.startsWith("/api/maintenance-status")) {
    return next();
  }

  const dbProtection = getDbProtection();

  if (dbProtection && req.path.startsWith("/api/search/advanced")) {
    return res.status(503).json({
      message: "Advanced search is temporarily disabled to protect database stability.",
      protection: true,
      reason: "db_latency_high",
    });
  }

  if (dbProtection && req.path.startsWith("/api/backups") && req.method !== "GET") {
    return res.status(503).json({
      message: "Export/backup write operations are temporarily disabled.",
      protection: true,
      reason: "db_latency_high",
    });
  }

  if (controlState.rejectHeavyRoutes && isHeavyRoute(req.path)) {
    return res.status(503).json({
      message: "Route temporarily throttled by protection mode.",
      protection: true,
      mode: controlState.mode,
    });
  }

  return next();
}

attachProcessMessageHandlers({
  onGracefulShutdown: () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 25_000).unref();
  },
});
startRuntimeLoops({
  clearSearchCache: () => aiSearchService.clearSearchCache(),
});

// Keep default parser small; enable larger payload only for import endpoints.
app.use("/api/imports", express.json({ limit: IMPORT_BODY_LIMIT }));
app.use("/api/imports", express.urlencoded({ extended: true, limit: IMPORT_BODY_LIMIT }));
app.use("/api/collection", express.json({ limit: COLLECTION_BODY_LIMIT }));
app.use("/api/collection", express.urlencoded({ extended: true, limit: COLLECTION_BODY_LIMIT }));
app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Receipt files are served via authenticated API endpoints only.
app.use("/uploads/collection-receipts", (_req, res) => {
  return res.status(404).json({ ok: false, message: "Not found." });
});
app.use("/uploads", express.static(UPLOADS_ROOT_DIR));

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  recordRequestStarted();

  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    recordRequestFinished(elapsedMs);
  });

  next();
});

app.use(adaptiveRateLimit);
app.use(systemProtectionMiddleware);

type AiRole = "user" | "admin" | "superuser";
type AiRoute = "search" | "chat";

type AiGateLease = {
  role: AiRole;
  route: AiRoute;
  released: boolean;
};

type AiGateAcquireResult = {
  lease: AiGateLease;
  waitedMs: number;
};

type AiGateQueueItem = {
  id: number;
  role: AiRole;
  route: AiRoute;
  enqueuedAt: number;
  resolve: (result: AiGateAcquireResult) => void;
  reject: (error: Error & { code?: string; status?: number }) => void;
  timeout: NodeJS.Timeout;
};

let aiGateSeq = 0;
let aiGateInflightGlobal = 0;
const aiGateInflightByRole: Record<AiRole, number> = {
  user: 0,
  admin: 0,
  superuser: 0,
};
const aiGateQueue: AiGateQueueItem[] = [];

function normalizeAiRole(role: string | undefined): AiRole {
  if (role === "superuser") return "superuser";
  if (role === "admin") return "admin";
  return "user";
}

function getAiGateSnapshot(role?: AiRole) {
  const safeRole = role ? normalizeAiRole(role) : "user";
  return {
    globalInFlight: aiGateInflightGlobal,
    globalLimit: AI_GATE_GLOBAL_LIMIT,
    queueSize: aiGateQueue.length,
    queueLimit: AI_GATE_QUEUE_LIMIT,
    role: safeRole,
    roleInFlight: aiGateInflightByRole[safeRole],
    roleLimit: AI_GATE_ROLE_LIMITS[safeRole],
  };
}

function aiGateCanAcquire(role: AiRole) {
  return aiGateInflightGlobal < AI_GATE_GLOBAL_LIMIT && aiGateInflightByRole[role] < AI_GATE_ROLE_LIMITS[role];
}

function aiGateAcquire(role: AiRole, route: AiRoute): AiGateLease {
  aiGateInflightGlobal += 1;
  aiGateInflightByRole[role] += 1;
  return {
    role,
    route,
    released: false,
  };
}

function aiGateRelease(lease: AiGateLease) {
  if (lease.released) return;
  lease.released = true;

  aiGateInflightGlobal = Math.max(0, aiGateInflightGlobal - 1);
  aiGateInflightByRole[lease.role] = Math.max(0, aiGateInflightByRole[lease.role] - 1);

  queueMicrotask(() => {
    drainAiGateQueue();
  });
}

function drainAiGateQueue() {
  if (aiGateQueue.length === 0) return;

  let progressed = true;
  while (progressed && aiGateQueue.length > 0) {
    progressed = false;
    for (let i = 0; i < aiGateQueue.length; i += 1) {
      const item = aiGateQueue[i];
      if (!aiGateCanAcquire(item.role)) continue;

      aiGateQueue.splice(i, 1);
      clearTimeout(item.timeout);
      progressed = true;

      item.resolve({
        lease: aiGateAcquire(item.role, item.route),
        waitedMs: Math.max(0, Date.now() - item.enqueuedAt),
      });
      break;
    }
  }
}

function createAiGateError(
  message: string,
  code: string,
  status = 429,
): Error & { code?: string; status?: number } {
  const err = new Error(message) as Error & { code?: string; status?: number };
  err.code = code;
  err.status = status;
  return err;
}

function acquireAiGate(role: AiRole, route: AiRoute): Promise<AiGateAcquireResult> {
  if (aiGateCanAcquire(role)) {
    return Promise.resolve({
      lease: aiGateAcquire(role, route),
      waitedMs: 0,
    });
  }

  if (aiGateQueue.length >= AI_GATE_QUEUE_LIMIT) {
    return Promise.reject(
      createAiGateError(
        "AI queue is full. Please retry in a few seconds.",
        "AI_GATE_QUEUE_FULL",
        429,
      ),
    );
  }

  return new Promise<AiGateAcquireResult>((resolve, reject) => {
    const id = ++aiGateSeq;
    const timeout = setTimeout(() => {
      const index = aiGateQueue.findIndex((item) => item.id === id);
      if (index >= 0) {
        aiGateQueue.splice(index, 1);
      }
      reject(
        createAiGateError(
          "AI queue wait timed out. Please retry.",
          "AI_GATE_WAIT_TIMEOUT",
          429,
        ),
      );
    }, AI_GATE_QUEUE_WAIT_MS).unref();

    aiGateQueue.push({
      id,
      role,
      route,
      enqueuedAt: Date.now(),
      resolve,
      reject,
      timeout,
    });

    drainAiGateQueue();
  });
}

function withAiConcurrencyGate(
  route: AiRoute,
  handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>,
) {
  return async (req: AuthenticatedRequest, res: Response) => {
    const role = normalizeAiRole(req.user?.role);
    let acquired: AiGateAcquireResult | null = null;

    try {
      acquired = await acquireAiGate(role, route);
    } catch (error: any) {
      const status = Number.isFinite(error?.status) ? Number(error.status) : 429;
      const snapshot = getAiGateSnapshot(role);
      return res.status(status).json({
        message: error?.message || "AI queue is currently busy. Please retry shortly.",
        gate: {
          ...snapshot,
          queueWaitMs: AI_GATE_QUEUE_WAIT_MS,
          code: error?.code || "AI_GATE_BUSY",
        },
      });
    }

    const releaseOnce = () => {
      if (!acquired) return;
      aiGateRelease(acquired.lease);
      acquired = null;
    };

    res.once("finish", releaseOnce);
    res.once("close", releaseOnce);
    res.setHeader("x-ai-gate-global-limit", String(AI_GATE_GLOBAL_LIMIT));
    res.setHeader("x-ai-gate-inflight", String(aiGateInflightGlobal));
    res.setHeader("x-ai-gate-queue-size", String(aiGateQueue.length));
    if (acquired.waitedMs > 0) {
      res.setHeader("x-ai-gate-wait-ms", String(Math.round(acquired.waitedMs)));
    }

    try {
      await handler(req, res);
    } finally {
      releaseOnce();
    }
  };
}

const runtimeConfigManager = createRuntimeConfigManager({
  storage,
  secret: JWT_SECRET,
  defaults: {
    sessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
    wsIdleMinutes: DEFAULT_WS_IDLE_MINUTES,
    aiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
    searchResultLimit: 200,
    viewerRowsPerPage: 100,
  },
  maintenanceCacheTtlMs: MAINTENANCE_CACHE_TTL_MS,
  runtimeSettingsCacheTtlMs: RUNTIME_SETTINGS_CACHE_TTL_MS,
});
const {
  invalidateMaintenanceCache,
  invalidateRuntimeSettingsCache,
  getRuntimeSettingsCached,
  getMaintenanceStateCached,
  maintenanceGuard,
} = runtimeConfigManager;

app.use(maintenanceGuard);

registerSystemRoutes(app, {
  authenticateToken: modularAuthenticateToken,
  requireRole: modularRequireRole,
  requireMonitorAccess: modularRequireMonitorAccess,
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
  createAuditLog: (data) => storage.createAuditLog(data),
});

registerAuthRoutes(app, {
  storage,
  authenticateToken: modularAuthenticateToken,
  requireRole: modularRequireRole,
  connectedClients,
});

registerActivityRoutes(app, {
  storage,
  authenticateToken: modularAuthenticateToken,
  requireRole: modularRequireRole,
  requireTabAccess: modularRequireTabAccess,
  connectedClients,
});

registerImportRoutes(app, {
  storage,
  importsRepository,
  importAnalysisService,
  authenticateToken: modularAuthenticateToken,
  requireRole: modularRequireRole,
  requireTabAccess: modularRequireTabAccess,
  searchRateLimiter,
  getRuntimeSettingsCached,
  isDbProtected: getDbProtection,
});

registerSearchRoutes(app, {
  storage,
  searchRepository,
  authenticateToken: modularAuthenticateToken,
  searchRateLimiter,
  getRuntimeSettingsCached,
  isDbProtected: getDbProtection,
});

registerAiRoutes(app, {
  storage,
  authenticateToken: modularAuthenticateToken,
  requireRole: modularRequireRole,
  withAiConcurrencyGate,
  getRuntimeSettingsCached,
  aiSearchService,
  categoryStatsService,
  aiChatService,
  aiIndexService,
  getOllamaConfig,
  defaultAiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
});

registerSettingsRoutes(app, {
  storage,
  authenticateToken: modularAuthenticateToken,
  requireRole: modularRequireRole,
  clearTabVisibilityCache: clearModularTabVisibilityCache,
  invalidateRuntimeSettingsCache,
  invalidateMaintenanceCache,
  getMaintenanceStateCached,
  broadcastWsMessage,
  defaultAiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
});

registerOperationsRoutes(app, {
  storage,
  auditRepository,
  backupsRepository,
  analyticsRepository,
  authenticateToken: modularAuthenticateToken,
  requireRole: modularRequireRole,
  requireTabAccess: modularRequireTabAccess,
  withExportCircuit,
  isExportCircuitOpenError: (error) => error instanceof CircuitOpenError,
  connectedClients,
});

registerCollectionRoutes(app, {
  storage,
  authenticateToken: modularAuthenticateToken,
  requireRole: modularRequireRole,
  requireTabAccess: modularRequireTabAccess,
});

setInterval(() => {
  const now = Date.now();

  for (const [ip, bucket] of adaptiveRateState.entries()) {
    if (now >= bucket.resetAt + 60_000) {
      adaptiveRateState.delete(ip);
    }
  }
  aiSearchService.sweepCaches(now);
}, 30_000).unref();

app.use(errorHandler);

async function startServer() {
  console.log("");
  console.log("=========================================");
  console.log("  SQR - SUMBANGAN QUERY RAHMAH");
  console.log("  Mode: Local (PostgreSQL Database)");
  console.log("=========================================");
  console.log("");

  console.log("  Database: PostgreSQL - OK");
  await storage.init();
  if (AI_PRECOMPUTE_ON_START) {
    // Precompute runs later (non-blocking) below.
  }

  registerFrontendStatic(app);
  startIdleSessionSweeper({
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
  });

  const PORT = parseInt(process.env.PORT || "5000", 10);
  const HOST = "0.0.0.0";

  // Enable SO_REUSEADDR to allow rapid rebinding after process restart
  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      notifyMasterFatalStartup("EADDRINUSE", `Port ${PORT} is already in use`);
      console.error(`âŒ Port ${PORT} is already in use.`);
      console.error(`   This usually means a previous server process hasn't fully released the port yet.`);
      console.error(`   Please wait a few seconds and try again, or use: lsof -i :${PORT} (or netstat -ano | findstr :${PORT} on Windows)`);
      setTimeout(() => process.exit(98), 10).unref();
    } else {
      notifyMasterFatalStartup("SERVER_STARTUP_ERROR", String(err?.message || err));
      console.error(`âŒ Server error:`, err);
      setTimeout(() => process.exit(1), 10).unref();
    }
  });

  server.listen(PORT, HOST, () => {
    console.log("");
    console.log("=========================================");
    console.log(`  Server berjalan di port ${PORT}`);
    console.log("");
    console.log("  Buka browser:");
    console.log(`    http://localhost:${PORT}`);
    console.log("");
    console.log("  Untuk akses dari PC lain (LAN):");
    console.log(`    http://[IP-KOMPUTER]:${PORT}`);
    console.log("=========================================");
    console.log("");
  });

  if (AI_PRECOMPUTE_ON_START) {
    // Run precompute in background so startup is fast.
    setTimeout(async () => {
      try {
        const result = await categoryStatsService.warmCategoryStats();
        if (result.skipped) {
          console.log("âœ… Category stats already present. Skipping precompute.");
          return;
        }
        console.log(`â±ï¸ Precomputing category stats (${result.computeKeys} key(s))...`);
        console.log("âœ… Precomputed category stats.");
      } catch (err: any) {
        console.error("âŒ Precompute stats failed:", err?.message || err);
      }
    }, 0);
  }
}

startServer();


