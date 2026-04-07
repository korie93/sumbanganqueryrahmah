import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { ollamaChat, ollamaEmbed } from "../ai-ollama";
import { runtimeConfig } from "../config/runtime";
import { pool } from "../db-postgres";
import { evaluateSystem } from "../intelligence";
import { logger } from "../lib/logger";
import { getCollectionRecordDailyRollupRefreshQueueSnapshot } from "../repositories/collection-record-repository-utils";
import { MonitorAlertHistoryRepository } from "../repositories/monitor-alert-history.repository";
import { PostgresStorage } from "../storage-postgres";
import { createAiConcurrencyGate } from "./aiConcurrencyGate";
import { createApiProtectionMiddleware } from "./apiProtection";
import {
  createLocalServerComposition,
  registerLocalServerRoutes,
} from "./local-server-composition";
import { registerLocalHttpPipeline } from "./local-http-pipeline";
import {
  attachLocalRuntimeGlue,
  getSearchQueueLength,
} from "./local-runtime-glue";
import { createRuntimeConfigManager } from "./runtime-config-manager";
import { createRuntimeMonitorManager } from "./runtime-monitor-manager";
import { wrapAsyncPrototypeMethods } from "./wrapAsyncPrototypeMethods";
import { applyTrustedProxies } from "../http/trust-proxy";

type CreateLocalRuntimeEnvironmentOptions = {
  notifyFatalStartup?: (reason: string, details?: string) => void;
};

const DB_METHOD_WRAP_EXCLUDE = new Set<string>(["constructor"]);

export function createLocalRuntimeEnvironment(options: CreateLocalRuntimeEnvironmentOptions = {}) {
  const storage = new PostgresStorage();
  const app = express();
  applyTrustedProxies(app, runtimeConfig.app.trustedProxies);
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  const notifyFatalStartup = options.notifyFatalStartup ?? (() => undefined);

  wss.on("error", (err: NodeJS.ErrnoException) => {
    const code = String(err?.code || "");
    if (code === "EADDRINUSE") {
      notifyFatalStartup("EADDRINUSE", "WebSocket server failed to bind address");
      logger.error("WebSocket startup failed because the port is already in use", {
        path: "/ws",
      });
      setTimeout(() => process.exit(98), 10).unref();
      return;
    }
    logger.error("WebSocket server error", { error: err, path: "/ws" });
  });

  const runtimeMonitorManager = createRuntimeMonitorManager({
    pool,
    apiDebugLogs: runtimeConfig.app.debugLogs,
    lowMemoryMode: runtimeConfig.cluster.lowMemoryMode,
    pgPoolWarnCooldownMs: runtimeConfig.runtime.pgPoolWarnCooldownMs,
    aiLatencyStaleAfterMs: runtimeConfig.ai.latency.staleAfterMs,
    aiLatencyDecayHalfLifeMs: runtimeConfig.ai.latency.decayHalfLifeMs,
    getSearchQueueLength: () => getSearchQueueLength(),
    getCollectionRollupRefreshQueueSnapshot: () => getCollectionRecordDailyRollupRefreshQueueSnapshot(),
    syncAlertHistory: async (_snapshot, alerts, observedAt) => {
      await new MonitorAlertHistoryRepository().syncCurrentAlerts(alerts, observedAt);
    },
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

  wrapAsyncPrototypeMethods(storage, {
    exclude: DB_METHOD_WRAP_EXCLUDE,
    wrap: withDbCircuit,
  });

  const composition = createLocalServerComposition({
    storage,
    wss,
    secret: runtimeConfig.auth.sessionSecret,
    withAiCircuit,
    ollamaChat,
    ollamaEmbed,
    defaultAiTimeoutMs: runtimeConfig.runtime.defaults.aiTimeoutMs,
    lowMemoryMode: runtimeConfig.cluster.lowMemoryMode,
  });
  const {
    aiSearchService,
    categoryStatsService,
    connectedClients,
  } = composition;
  const { adaptiveRateLimit, systemProtectionMiddleware, sweepAdaptiveRateState } =
    createApiProtectionMiddleware({
      getControlState,
      getDbProtection,
    });

  const { withAiConcurrencyGate } = createAiConcurrencyGate({
    globalLimit: runtimeConfig.ai.gate.globalLimit,
    queueLimit: runtimeConfig.ai.gate.queueLimit,
    queueWaitMs: runtimeConfig.ai.gate.queueWaitMs,
    roleLimits: runtimeConfig.ai.gate.roleLimits,
  });

  const runtimeConfigManager = createRuntimeConfigManager({
    storage,
    secret: runtimeConfig.auth.sessionSecret,
    defaults: runtimeConfig.runtime.defaults,
    maintenanceCacheTtlMs: runtimeConfig.runtime.maintenanceCacheTtlMs,
    runtimeSettingsCacheTtlMs: runtimeConfig.runtime.runtimeSettingsCacheTtlMs,
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
    importBodyLimit: runtimeConfig.app.bodyLimits.imports,
    collectionBodyLimit: runtimeConfig.app.bodyLimits.collection,
    defaultBodyLimit: runtimeConfig.app.bodyLimits.default,
    uploadsRootDir: runtimeConfig.app.uploadsRootDir,
    recordRequestStarted,
    recordRequestFinished,
    adaptiveRateLimit,
    systemProtectionMiddleware,
    maintenanceGuard,
  });
  registerLocalServerRoutes({
    app,
    server,
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
    defaultAiTimeoutMs: runtimeConfig.runtime.defaults.aiTimeoutMs,
  });

  return {
    app,
    server,
    storage,
    connectedClients,
    categoryStatsService,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes: runtimeConfig.runtime.defaults.sessionTimeoutMinutes,
    aiPrecomputeOnStart: runtimeConfig.ai.precomputeOnStart,
    port: runtimeConfig.app.port,
    host: runtimeConfig.app.host,
  };
}
