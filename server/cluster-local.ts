import "dotenv/config";
import cluster from "node:cluster";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeConfig } from "./config/runtime";
import { createClusterMasterOrchestrator } from "./internal/cluster-master-orchestrator";
import { createClusterMasterFatalHandlers } from "./internal/cluster-master-fatal-handlers";
import {
  normalizeInitialWorkerCount,
  resolveSafeClusterWorkerTopology,
  shouldUseSingleProcessMode,
} from "./internal/cluster-mode";
import { logger } from "./lib/logger";

const SCALE_INTERVAL_MS = 5_000;
const LOW_LOAD_HOLD_MS = 60_000;
const ACTIVE_REQUESTS_THRESHOLD = 80;
const LOW_REQ_RATE_THRESHOLD = 8;
const LOW_MEMORY_MODE = runtimeConfig.cluster.lowMemoryMode;
const PREALLOCATE_MB = runtimeConfig.cluster.preallocateMb;
const MAX_SPAWN_PER_CYCLE = 1;

// HARD CAP: Prevent uncontrolled worker spawning
const MAX_WORKERS = Math.min(4, os.cpus().length);
const requestedMaxWorkers = runtimeConfig.cluster.maxWorkers;
const normalizedMaxWorkers = Number.isFinite(requestedMaxWorkers) ? Math.floor(requestedMaxWorkers) : 1;
const sharedRuntimeStateConfigured =
  runtimeConfig.rateLimiting.store.distributedStoreConfigured
  && runtimeConfig.websocket.sharedBus.distributedBusConfigured;
const safeWorkerTopology = resolveSafeClusterWorkerTopology({
  requestedMaxWorkers: normalizedMaxWorkers,
  sharedRuntimeStateConfigured,
  // Redis-backed rate limits now cover route counters, adaptive protection,
  // and 2FA replay checks. WebSocket fan-out requires its Redis bus too.
  sharedRuntimeStateEnabled: sharedRuntimeStateConfigured,
});
const MAX_WORKERS_HARD_CAP = Math.max(1, Math.min(MAX_WORKERS, safeWorkerTopology.maxWorkers));
const INITIAL_WORKERS = normalizeInitialWorkerCount({
  maxWorkers: MAX_WORKERS_HARD_CAP,
  initialWorkers: runtimeConfig.cluster.initialWorkers,
});
const SINGLE_PROCESS_MODE = shouldUseSingleProcessMode({
  maxWorkers: MAX_WORKERS_HARD_CAP,
  forceCluster: runtimeConfig.cluster.forceCluster ? "1" : undefined,
});
const MIN_WORKERS = 1;
const SCALE_COOLDOWN_MS = LOW_MEMORY_MODE ? 30_000 : 15_000; // more conservative in low-memory mode
const RESTART_THROTTLE_MS = 2_000; // 2 second throttle between restart attempts
const MAX_RESTART_ATTEMPTS = 5; // Stop restarting after 5 consecutive failures
const RESTART_FAILURE_WINDOW_MS = 60_000; // Count crashes inside rolling window
const RESTART_BLOCK_MS = 60_000; // Pause restart attempts after crash-loop detection

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerExec = path.join(__dirname, "index-local.js");

const clusterMaster = createClusterMasterOrchestrator({
  clusterModule: cluster,
  workerExec,
  logger,
  config: {
    scaleIntervalMs: SCALE_INTERVAL_MS,
    lowLoadHoldMs: LOW_LOAD_HOLD_MS,
    activeRequestsThreshold: ACTIVE_REQUESTS_THRESHOLD,
    lowReqRateThreshold: LOW_REQ_RATE_THRESHOLD,
    lowMemoryMode: LOW_MEMORY_MODE,
    preallocateMb: PREALLOCATE_MB,
    maxSpawnPerCycle: MAX_SPAWN_PER_CYCLE,
    maxWorkers: MAX_WORKERS_HARD_CAP,
    minWorkers: MIN_WORKERS,
    initialWorkers: INITIAL_WORKERS,
    scaleCooldownMs: SCALE_COOLDOWN_MS,
    restartThrottleMs: RESTART_THROTTLE_MS,
    maxRestartAttempts: MAX_RESTART_ATTEMPTS,
    restartFailureWindowMs: RESTART_FAILURE_WINDOW_MS,
    restartBlockMs: RESTART_BLOCK_MS,
    gracefulShutdownTimeoutMs: runtimeConfig.runtime.gracefulShutdownTimeoutMs,
  },
});
const clusterMasterFatalHandlers = createClusterMasterFatalHandlers({
  clusterMaster,
  logger,
});

// Fatal master-level errors should fail fast so the process supervisor can restart cleanly.
process.on("uncaughtException", (err) => {
  clusterMasterFatalHandlers.handleUncaughtException(err);
});

process.on("unhandledRejection", (reason) => {
  clusterMasterFatalHandlers.handleUnhandledRejection(reason);
});

function handleClusterShutdownSignal(signal: NodeJS.Signals) {
  clusterMaster.shutdownGracefully(signal);
}

function handleSupervisorShutdownMessage(message: unknown) {
  if (message !== "shutdown") {
    return;
  }

  process.off("message", handleSupervisorShutdownMessage);
  handleClusterShutdownSignal("SIGTERM");
}

if (cluster.isPrimary) {
  if (safeWorkerTopology.downgradedToSingleWorker) {
    logger.warn("SQR_MAX_WORKERS was reduced to one worker because shared runtime security state is not active", {
      configuredRateLimitStore: runtimeConfig.rateLimiting.store.provider,
      configuredWebSocketBus: runtimeConfig.websocket.sharedBus.provider,
      maxWorkers: MAX_WORKERS_HARD_CAP,
      reason: safeWorkerTopology.reason,
      requestedMaxWorkers: safeWorkerTopology.requestedMaxWorkers,
    });
  }

  if (SINGLE_PROCESS_MODE) {
    logger.info("Starting server in single-process mode", {
      maxWorkers: MAX_WORKERS_HARD_CAP,
      reason: "cluster-single-worker-bypass",
    });
    await import("./index-local.js");
  } else {
    process.on("message", handleSupervisorShutdownMessage);
    process.once("SIGINT", handleClusterShutdownSignal);
    process.once("SIGTERM", handleClusterShutdownSignal);
    clusterMaster.bootCluster();
  }
} else {
  // In case this file is accidentally used as worker entry.
  await import("./index-local.js");
}
