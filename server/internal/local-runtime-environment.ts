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
import { createAdaptiveRateStateStore } from "./redis-adaptive-rate-store";
import { startRedisHealthMonitor } from "./redis-health-monitor";
import { configureTwoFactorReplayStoreForRuntime } from "../auth/two-factor-replay-cache";
import { createTwoFactorReplayStore } from "../auth/redis-two-factor-replay-store";
import { configureSessionRevocationStoreForRuntime } from "../auth/session-revocation-store";
import { createSessionRevocationStore } from "../auth/redis-session-revocation-store";
import { startOrphanedUploadCleanupJob } from "../jobs/cleanup-orphaned-uploads";
import { stopAdaptiveRateLimitCooldownSweep } from "../middleware/rate-limit";
import { createBackgroundQueueRuntime } from "../queue/runtime";
import {
  createLocalServerComposition,
  registerLocalServerRoutes,
} from "./local-server-composition";
import { startBackgroundServiceWithHealthSignal } from "./background-service-health";
import { registerLocalHttpPipeline } from "./local-http-pipeline";
import {
  attachLocalRuntimeGlue,
  getSearchQueueLength,
} from "./local-runtime-glue";
import { createRuntimeConfigManager } from "./runtime-config-manager";
import { createRuntimeMonitorManager } from "./runtime-monitor-manager";
import { wrapAsyncPrototypeMethods } from "./wrapAsyncPrototypeMethods";
import { applyTrustedProxies } from "../http/trust-proxy";
import { HTTP_SERVER_SOCKET_TIMEOUT_MS } from "../http/http-server-timeouts";
import { ActivityService } from "../services/activity.service";
import { startActivityRetentionJob } from "./activity-retention-job";

type CreateLocalRuntimeEnvironmentOptions = {
  onGracefulShutdownMessage?: (reason: string) => void;
  notifyFatalStartup?: (reason: string, details?: string) => void;
};

const DB_METHOD_WRAP_EXCLUDE = new Set<string>(["constructor"]);
const WEBSOCKET_MAX_PAYLOAD_BYTES = 100 * 1024;

export function createLocalRuntimeEnvironment(options: CreateLocalRuntimeEnvironmentOptions = {}) {
  const storage = new PostgresStorage();
  let webSocketConnectionsReady = false;
  let webSocketShutdownInProgress = false;
  const app = express();
  applyTrustedProxies(app, runtimeConfig.app.trustedProxies);
  const server = createServer(app);
  // Keep the transport timeout above every application-owned request deadline.
  // Otherwise Node closes the upstream socket first and Nginx converts the
  // controlled application timeout into an opaque 502 response.
  server.setTimeout(HTTP_SERVER_SOCKET_TIMEOUT_MS);
  // The server owns several one-shot shutdown cleanup hooks (WebSocket,
  // cache sweepers, rate limit sweeps, telemetry guards, queue listeners).
  // Raise the per-server listener cap so Node does not report those expected
  // lifecycle hooks as a possible leak.
  // AUDIT2-FIX [M3]: keep the expected lifecycle listener allowance configurable.
  server.setMaxListeners(Math.max(server.getMaxListeners(), runtimeConfig.runtime.maxEventListeners));
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: WEBSOCKET_MAX_PAYLOAD_BYTES,
  });
  const notifyFatalStartup = options.notifyFatalStartup ?? (() => undefined);

  wss.on("error", (err: NodeJS.ErrnoException) => {
    const code = String(err?.code || "");
    if (code === "EADDRINUSE") {
      notifyFatalStartup("EADDRINUSE", "WebSocket server failed to bind address");
      logger.error("WebSocket startup failed because the port is already in use", {
        path: "/ws",
      });
      server.emit("error", err);
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
    stop,
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
    acceptWebSocketConnections: () => webSocketConnectionsReady,
    isWebSocketShutdownInProgress: () => webSocketShutdownInProgress,
  });
  server.once("close", composition.stopTabVisibilityCacheSweep);
  server.once("close", composition.stopActivityUpdateCacheSweep);
  server.once("close", composition.clearSessionRefreshDeduplication);
  const {
    aiSearchService,
    categoryStatsService,
    connectedClients,
  } = composition;
  const adaptiveRateStore = createAdaptiveRateStateStore(runtimeConfig.rateLimiting.store);
  const stopRedisHealthMonitor = startRedisHealthMonitor({
    intervalMs: runtimeConfig.runtime.redisHealthCheckIntervalMs,
    targets: [
      {
        label: "rate-limit/adaptive/2fa/revocation",
        redisUrl: runtimeConfig.rateLimiting.store.provider === "redis"
          ? runtimeConfig.rateLimiting.store.redisUrl
          : null,
      },
      {
        label: "websocket-shared-bus",
        redisUrl: runtimeConfig.websocket.sharedBus.provider === "redis"
          ? runtimeConfig.websocket.sharedBus.redisUrl
          : null,
      },
    ],
  });
  server.once("close", stopRedisHealthMonitor);
  const stopTwoFactorReplayStore = configureTwoFactorReplayStoreForRuntime(
    createTwoFactorReplayStore(runtimeConfig.rateLimiting.store),
  );
  server.once("close", stopTwoFactorReplayStore);
  const stopSessionRevocationStore = configureSessionRevocationStoreForRuntime(
    createSessionRevocationStore(runtimeConfig.rateLimiting.store),
  );
  server.once("close", stopSessionRevocationStore);
  const backgroundQueueRuntime = createBackgroundQueueRuntime(runtimeConfig.queue);
  const backgroundQueueHealthSignal = startBackgroundServiceWithHealthSignal({
    service: "background-job-queue",
    failureReason: "BACKGROUND_JOB_QUEUE_START_FAILED",
    failureDetails: "BullMQ background queues failed to start; scheduled cleanup will be degraded.",
    failureLogMessage: "Failed to start BullMQ background job queues",
    start: () => backgroundQueueRuntime.start(),
  });
  server.once("close", () => {
    backgroundQueueHealthSignal.stop();
    void backgroundQueueRuntime.close().catch((error) => {
      logger.warn("Failed to close BullMQ background job queues cleanly", { error });
    });
  });
  if (!backgroundQueueRuntime.configured) {
    const stopOrphanedUploadCleanupJob = startOrphanedUploadCleanupJob();
    server.once("close", stopOrphanedUploadCleanupJob);
  }
  const { adaptiveRateLimit, systemProtectionMiddleware, stopAdaptiveRateStateSweep } =
    createApiProtectionMiddleware({
      ...(adaptiveRateStore ? { adaptiveRateStore } : {}),
      getControlState,
      getDbProtection,
      userLimitsPerMinute: runtimeConfig.rateLimiting.userLimitsPerMinute,
    });
  server.once("close", stopAdaptiveRateStateSweep);
  server.once("close", stopAdaptiveRateLimitCooldownSweep);

  const { withAiConcurrencyGate, stopAiConcurrencyGate } = createAiConcurrencyGate({
    globalLimit: runtimeConfig.ai.gate.globalLimit,
    queueLimit: runtimeConfig.ai.gate.queueLimit,
    queueWaitMs: runtimeConfig.ai.gate.queueWaitMs,
    roleLimits: runtimeConfig.ai.gate.roleLimits,
  });
  server.once("close", stopAiConcurrencyGate);

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
    onGracefulShutdownMessage: options.onGracefulShutdownMessage,
    startRuntimeLoops,
    stopRuntimeMonitor: stop,
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
    backgroundQueues: {
      getHealthSnapshot: () => backgroundQueueRuntime.getHealthSnapshot(),
      getQueue: (queueName) => backgroundQueueRuntime.getQueue(queueName),
    },
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
    startActivityRetentionJob: () => {
      const activityService = new ActivityService(storage, connectedClients);
      return startActivityRetentionJob({
        runCleanup: async (now) => {
          await activityService.cleanupEndedActivityLogs({
            now,
            performedBy: "system:activity-retention",
            source: "automatic",
          });
        },
      });
    },
    port: runtimeConfig.app.port,
    host: runtimeConfig.app.host,
    markWebSocketConnectionsReady: () => {
      webSocketConnectionsReady = true;
    },
    markWebSocketConnectionsDraining: () => {
      webSocketShutdownInProgress = true;
      webSocketConnectionsReady = false;
    },
  };
}
