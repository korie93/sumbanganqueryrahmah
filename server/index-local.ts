import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { PostgresStorage } from "./storage-postgres";
import { pool } from "./db-postgres";
import { ollamaChat, ollamaEmbed } from "./ai-ollama";
import { createApiProtectionMiddleware } from "./internal/apiProtection";
import { registerLocalHttpPipeline } from "./internal/local-http-pipeline";
import {
  createLocalServerComposition,
  registerLocalServerRoutes,
} from "./internal/local-server-composition";
import {
  attachLocalRuntimeGlue,
  getSearchQueueLength,
} from "./internal/local-runtime-glue";
import { createRuntimeConfigManager } from "./internal/runtime-config-manager";
import { createAiConcurrencyGate } from "./internal/aiConcurrencyGate";
import { createRuntimeMonitorManager } from "./internal/runtime-monitor-manager";
import type { WorkerFatalMessage } from "./internal/worker-ipc";
import { wrapAsyncPrototypeMethods } from "./internal/wrapAsyncPrototypeMethods";
import { startLocalServer } from "./internal/server-startup";
import { evaluateSystem } from "./intelligence";
import { getSessionSecret } from "./config/security";

const storage = new PostgresStorage();
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
let startupFatalReason: string | null = null;
type WorkerIpcProcess = NodeJS.Process & {
  send?: (message: WorkerFatalMessage) => void;
};
const workerIpcProcess = process as WorkerIpcProcess;

function notifyMasterFatalStartup(reason: string, details?: string) {
  if (startupFatalReason) return;
  startupFatalReason = reason;

  if (typeof workerIpcProcess.send === "function") {
    try {
      workerIpcProcess.send({
        type: "worker-fatal",
        payload: { reason, details: details ?? "" },
      });
    } catch {
      // no-op
    }
  }
}

wss.on("error", (err: NodeJS.ErrnoException) => {
  const code = String(err?.code || "");
  if (code === "EADDRINUSE") {
    notifyMasterFatalStartup("EADDRINUSE", "WebSocket server failed to bind address");
    console.error("ERROR WebSocket startup failed: port already in use.");
    setTimeout(() => process.exit(98), 10).unref();
    return;
  }
  console.error("ERROR WebSocket server error:", err);
});

const JWT_SECRET = getSessionSecret();
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
const composition = createLocalServerComposition({
  storage,
  wss,
  secret: JWT_SECRET,
  withAiCircuit,
  ollamaChat,
  ollamaEmbed,
  defaultAiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
  lowMemoryMode: LOW_MEMORY_MODE,
});
const {
  aiSearchService,
  categoryStatsService,
  connectedClients,
} = composition;
const { adaptiveRateLimit, systemProtectionMiddleware, sweepAdaptiveRateState } = createApiProtectionMiddleware({
  getControlState,
  getDbProtection,
});

const { withAiConcurrencyGate } = createAiConcurrencyGate({
  globalLimit: AI_GATE_GLOBAL_LIMIT,
  queueLimit: AI_GATE_QUEUE_LIMIT,
  queueWaitMs: AI_GATE_QUEUE_WAIT_MS,
  roleLimits: AI_GATE_ROLE_LIMITS,
});

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

attachLocalRuntimeGlue({
  server,
  aiSearchService,
  attachGcObserver,
  attachProcessMessageHandlers,
  startRuntimeLoops,
  sweepAdaptiveRateState,
});

registerLocalHttpPipeline(app, {
  importBodyLimit: IMPORT_BODY_LIMIT,
  collectionBodyLimit: COLLECTION_BODY_LIMIT,
  defaultBodyLimit: DEFAULT_BODY_LIMIT,
  uploadsRootDir: UPLOADS_ROOT_DIR,
  recordRequestStarted,
  recordRequestFinished,
  adaptiveRateLimit,
  systemProtectionMiddleware,
  maintenanceGuard,
});
registerLocalServerRoutes({
  app,
  composition,
  runtimeConfig: {
    getRuntimeSettingsCached,
    getMaintenanceStateCached,
    invalidateRuntimeSettingsCache,
    invalidateMaintenanceCache,
  },
  runtimeMonitor: {
    computeInternalMonitorSnapshot,
    buildInternalMonitorAlerts,
    getControlState,
    getDbProtection,
    getRequestRate,
    getLatencyP95,
    getLocalCircuitSnapshots,
  },
  withAiConcurrencyGate,
  withExportCircuit,
  defaultAiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
});

async function startServer() {
  await startLocalServer({
    app,
    server,
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
    aiPrecomputeOnStart: AI_PRECOMPUTE_ON_START,
    categoryStatsService,
    notifyFatalStartup: notifyMasterFatalStartup,
  });
}

startServer();


