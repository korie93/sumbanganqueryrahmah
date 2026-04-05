import "dotenv/config";
import cluster, { type Worker } from "node:cluster";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeConfig } from "./config/runtime";
import { normalizeInitialWorkerCount, shouldUseSingleProcessMode } from "./internal/cluster-mode";
import {
  toControlStateMessage,
  toGracefulShutdownMessage,
} from "./internal/cluster-control-state";
import { shutdownClusterMasterDueToFatalError } from "./internal/cluster-master-shutdown";
import {
  planClusterSpawnAttempt,
  recordUnexpectedWorkerExit,
  shouldRestoreMinimumClusterCapacity,
} from "./internal/cluster-restart-policy";
import { planClusterScaling } from "./internal/cluster-scaling-policy";
import { parseClusterWorkerMessage } from "./internal/cluster-worker-message-policy";
import {
  forkClusterWorker,
  pickLeastBusyClusterWorker,
  sendControlStateToWorker,
  sendGracefulShutdownToWorker,
} from "./internal/cluster-worker-runtime";
import { logger } from "./lib/logger";
import { LoadPredictor } from "./internal/loadPredictor";
import {
  type WorkerControlState,
  type WorkerMetricsPayload,
} from "./internal/worker-ipc";

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
const MAX_WORKERS_HARD_CAP = Math.max(1, Math.min(MAX_WORKERS, normalizedMaxWorkers));
const INITIAL_WORKERS = normalizeInitialWorkerCount({
  maxWorkers: MAX_WORKERS_HARD_CAP,
  initialWorkers: runtimeConfig.cluster.initialWorkers,
});
const SINGLE_PROCESS_MODE = shouldUseSingleProcessMode({
  maxWorkers: MAX_WORKERS_HARD_CAP,
  forceCluster: process.env.SQR_FORCE_CLUSTER,
});
const MIN_WORKERS = 1;
const SCALE_COOLDOWN_MS = LOW_MEMORY_MODE ? 30_000 : 15_000; // more conservative in low-memory mode
const RESTART_THROTTLE_MS = 2_000; // 2 second throttle between restart attempts
const MAX_RESTART_ATTEMPTS = 5; // Stop restarting after 5 consecutive failures
const RESTART_FAILURE_WINDOW_MS = 60_000; // Count crashes inside rolling window
const RESTART_BLOCK_MS = 60_000; // Pause restart attempts after crash-loop detection

const predictor = new LoadPredictor({
  shortWindowSec: 30,
  longWindowSec: 90,
  trendThreshold: 0.2,
  sustainedMs: 30_000,
});

const workerMetrics = new Map<number, WorkerMetricsPayload>();
const workerFatalReasons = new Map<number, string>();
const wiredWorkers = new Set<number>();
const intentionalExits = new Set<number>();
const drainingWorkers = new Set<number>();
let lastSpawnAttemptTime = -Infinity; // Track actual spawn attempts (not exits)
let lastBroadcast: WorkerControlState | null = null;
let lowLoadSince: number | null = null;
let preAllocBuffer: Buffer | null = null;
let rollingRestartInProgress = false;
let lastScaleTime = 0; // Track cooldown for scaling operations
let unexpectedExitTimestamps: number[] = [];
let restartBlockedUntil = 0;
let lastRestartBlockLogAt = 0;
let fatalStartupLockReason: string | null = null;
let fatalShutdownScheduled = false;

// Hard-capped max workers (production safety)
function getMaxWorkers() {
  return MAX_WORKERS_HARD_CAP;
}

function getMinWorkers() {
  return MIN_WORKERS;
}

function getWorkers(): Worker[] {
  return Object.values(cluster.workers ?? {}).filter((w): w is Worker => Boolean(w));
}

function shutdownMasterDueToFatalError(reason: string, metadata?: Record<string, unknown>) {
  shutdownClusterMasterDueToFatalError({
    reason,
    metadata,
    clusterModule: cluster,
    workers: getWorkers(),
    logger,
    createGracefulShutdownMessage: toGracefulShutdownMessage,
    onSchedule: () => {
      if (fatalShutdownScheduled) {
        return true;
      }

      fatalShutdownScheduled = true;
      return false;
    },
  });
}

function broadcastControl(control: WorkerControlState) {
  lastBroadcast = control;
  const workers = getWorkers();

  for (const worker of workers) {
    sendControlStateToWorker({
      worker,
      control,
      logger,
      createControlStateMessage: toControlStateMessage,
    });
  }
}

// SAFE FORK: Prevents uncontrolled spawn + adds error handling
function safeFork(reason: string): Worker | null {
  if (fatalStartupLockReason) {
    logger.error("Spawn blocked due to fatal startup condition", {
      fatalStartupLockReason,
      spawnReason: reason,
    });
    return null;
  }

  const now = Date.now();
  if (now < restartBlockedUntil) {
    if (now - lastRestartBlockLogAt > 5_000) {
      const remainingMs = Math.max(0, restartBlockedUntil - now);
      logger.error("Restart temporarily blocked", {
        remainingSeconds: Math.ceil(remainingMs / 1000),
        spawnReason: reason,
      });
      lastRestartBlockLogAt = now;
    }
    return null;
  }

  // Count only workers that are actually running (not exiting/dead)
  const aliveWorkers = getWorkers().filter(w => !w.isDead() && w.isConnected());
  const maxWorkers = getMaxWorkers();

  if (aliveWorkers.length >= maxWorkers) {
    logger.warn("Max workers reached; skipping spawn", { maxWorkers, spawnReason: reason });
    return null;
  }

  return forkClusterWorker({
    clusterModule: cluster,
    reason,
    logger,
  });
}

function spawnWorker(reason: string): boolean {
  return safeFork(reason) !== null;
}

async function drainAndRestartWorker(worker: Worker, reason: string) {
  if (drainingWorkers.has(worker.id)) return;
  drainingWorkers.add(worker.id);
  intentionalExits.add(worker.id);
  sendGracefulShutdownToWorker({
    worker,
    reason,
    createGracefulShutdownMessage: toGracefulShutdownMessage,
  });

  const timeout = setTimeout(() => {
    try {
      worker.kill();
    } catch {
      // ignore
    }
  }, 30_000);

  worker.once("exit", () => {
    clearTimeout(timeout);
    drainingWorkers.delete(worker.id);
  });
}

async function rollingRestartOne(reason: string) {
  if (rollingRestartInProgress) return;
  const workers = getWorkers().filter((w) => !drainingWorkers.has(w.id));
  if (workers.length <= getMinWorkers()) return;

  rollingRestartInProgress = true;
  try {
    const candidate = pickLeastBusyClusterWorker({
      workers,
      getActiveRequests: (workerId) => workerMetrics.get(workerId)?.activeRequests ?? 0,
    });
    if (!candidate) {
      return;
    }
    await drainAndRestartWorker(candidate, reason);
  } finally {
    setTimeout(() => {
      rollingRestartInProgress = false;
    }, 10_000);
  }
}

function evaluateScale() {
  const workers = getWorkers();
  const maxWorkers = getMaxWorkers();
  const metricSamples = Array.from(workerMetrics.values());
  const now = Date.now();
  const trend = predictor.update({
    ts: now,
    requestRate: metricSamples.reduce((sum, sample) => sum + sample.reqRate, 0),
    latencyP95Ms: metricSamples.reduce((max, sample) => Math.max(max, sample.latencyP95Ms), 0),
    cpuPercent: metricSamples.length > 0
      ? metricSamples.reduce((sum, sample) => sum + sample.cpuPercent, 0) / metricSamples.length
      : 0,
  });

  // SCALE COOLDOWN: Prevent rapid spawn loops
  const timeSinceLastScale = now - lastScaleTime;
  const canScale = timeSinceLastScale >= SCALE_COOLDOWN_MS;

  // MEMORY PROTECTION: Skip scaling on high memory usage
  const memUsageMB = process.memoryUsage().rss / 1024 / 1024;
  const memoryScaleUpBlockMB = LOW_MEMORY_MODE ? 220 : 1200;
  const plan = planClusterScaling({
    workerMetrics: metricSamples,
    trend,
    workerCount: workers.length,
    maxWorkers,
    canScale,
    now,
    lowLoadSince,
    lowLoadHoldMs: LOW_LOAD_HOLD_MS,
    lowReqRateThreshold: LOW_REQ_RATE_THRESHOLD,
    activeRequestsThreshold: ACTIVE_REQUESTS_THRESHOLD,
    preallocateMb: PREALLOCATE_MB,
    maxSpawnPerCycle: MAX_SPAWN_PER_CYCLE,
    hasPreAllocBuffer: Boolean(preAllocBuffer),
    processRssMb: memUsageMB,
    memoryScaleUpBlockMb: memoryScaleUpBlockMB,
  });

  if (plan.memoryPressureHigh) {
    logger.warn("High memory detected; skipping scale up", { memoryUsageMB: Math.round(memUsageMB) });
  }

  if (plan.spawnReasons.length > 0) {
    let spawned = 0;
    for (const reason of plan.spawnReasons) {
      if (!spawnWorker(reason)) {
        break;
      }
      spawned += 1;
    }
    if (spawned > 0) {
      lastScaleTime = now;
    }
  }

  if (plan.shouldAllocatePrealloc) {
    preAllocBuffer = Buffer.alloc(PREALLOCATE_MB * 1024 * 1024);
  } else if (plan.shouldReleasePrealloc) {
    preAllocBuffer = null;
  }

  lowLoadSince = plan.nextLowLoadSince;

  if (plan.shouldScaleDown) {
    rollingRestartOne("scale-down-low-load").catch(() => undefined);
  }

  if (plan.shouldRestartForMemoryPressure) {
    rollingRestartOne("memory-pressure").catch(() => undefined);
  }

  broadcastControl(plan.control);
}

function wireWorker(worker: Worker) {
  if (wiredWorkers.has(worker.id)) return;
  wiredWorkers.add(worker.id);

  worker.on("message", (message: unknown) => {
    const outcome = parseClusterWorkerMessage(message);
    if (outcome.kind === "fatal") {
      workerFatalReasons.set(worker.id, outcome.reason);

      if (outcome.shouldLockAutomaticRestart) {
        fatalStartupLockReason = outcome.reason;
        restartBlockedUntil = Date.now() + RESTART_BLOCK_MS;
        lastRestartBlockLogAt = Date.now();
        logger.error("Worker reported fatal startup error and auto-restart is disabled", {
          workerId: worker.id,
          reason: outcome.reason,
        });
      } else {
        logger.error("Worker reported fatal startup error", {
          workerId: worker.id,
          reason: outcome.reason,
        });
      }
      return;
    }

    if (outcome.kind === "metrics") {
      workerMetrics.set(worker.id, {
        ...outcome.payload,
        workerId: worker.id,
        pid: worker.process.pid ?? outcome.payload.pid,
      });
      return;
    }

    if (outcome.kind === "memory-pressure") {
      rollingRestartOne("worker-memory-pressure").catch(() => undefined);
    }
  });
}

function bootCluster() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const workerExec = path.join(__dirname, "index-local.js");

  cluster.setupPrimary({
    exec: workerExec,
  });

  for (let i = 0; i < INITIAL_WORKERS; i += 1) {
    const worker = safeFork("initial-boot");
    if (worker) {
      wireWorker(worker);
    }
  }

  cluster.on("online", (worker) => {
    wireWorker(worker);
    if (lastBroadcast) {
      sendControlStateToWorker({
        worker,
        control: lastBroadcast,
        logger,
        createControlStateMessage: toControlStateMessage,
      });
    }
  });

  cluster.on("exit", (worker, code, signal) => {
    workerMetrics.delete(worker.id);
    wiredWorkers.delete(worker.id);
    drainingWorkers.delete(worker.id);
    const fatalReason = workerFatalReasons.get(worker.id);
    workerFatalReasons.delete(worker.id);

    if (fatalReason === "EADDRINUSE") {
      fatalStartupLockReason = "EADDRINUSE";
      logger.error("Worker exited due to EADDRINUSE; skipping automatic restart", {
        workerId: worker.id,
        code,
        signal,
      });
      if (getWorkers().length === 0) {
        shutdownMasterDueToFatalError("EADDRINUSE");
      }
      return;
    }

    const intentional = intentionalExits.has(worker.id);
    if (intentional) {
      intentionalExits.delete(worker.id);
    } else {
      // Restart Throttling & Circuit Breaker: Prevent infinite loops
      const now = Date.now();
      const unexpectedExitOutcome = recordUnexpectedWorkerExit({
        now,
        unexpectedExitTimestamps,
        restartFailureWindowMs: RESTART_FAILURE_WINDOW_MS,
        maxRestartAttempts: MAX_RESTART_ATTEMPTS,
        restartBlockMs: RESTART_BLOCK_MS,
      });
      unexpectedExitTimestamps = unexpectedExitOutcome.nextUnexpectedExitTimestamps;

      if (unexpectedExitOutcome.shouldBlockRestarts) {
        restartBlockedUntil = unexpectedExitOutcome.restartBlockedUntil ?? restartBlockedUntil;
        lastRestartBlockLogAt = now;
        logger.error("Crash loop detected; pausing worker restarts", {
          workerId: worker.id,
          code,
          maxRestartAttempts: MAX_RESTART_ATTEMPTS,
          failureWindowSeconds: Math.round(RESTART_FAILURE_WINDOW_MS / 1000),
          restartBlockSeconds: Math.round(RESTART_BLOCK_MS / 1000),
        });
        return;
      }
      
      logger.error("Worker exited unexpectedly; attempting restart", {
        workerId: worker.id,
        code,
        signal,
      });
      
      // Only allow ONE spawn attempt per RESTART_THROTTLE_MS period
      // This prevents rapid respawning when multiple workers fail in succession
      const restartSpawnAttempt = planClusterSpawnAttempt({
        now,
        lastSpawnAttemptTime,
        restartThrottleMs: RESTART_THROTTLE_MS,
      });
      if (restartSpawnAttempt.shouldSpawn) {
        lastSpawnAttemptTime = restartSpawnAttempt.nextLastSpawnAttemptTime;
        const w = safeFork("unexpected-exit-restart");
        if (w) {
          wireWorker(w);
          logger.info("Spawned replacement worker in response to failure", { workerId: w.id });
        } else {
          logger.warn("Failed to spawn replacement worker", { workerId: worker.id });
        }
      } else {
        // We just spawned within the throttle window - don't spawn again yet
        logger.info("Throttling worker restart because a spawn was attempted recently", {
          workerId: worker.id,
          remainingDelayMs: restartSpawnAttempt.remainingDelayMs,
        });
      }
    }

    // Keep minimum worker availability (but respect throttle and restart block)
    const now = Date.now();
    if (
      shouldRestoreMinimumClusterCapacity({
        fatalStartupLockReason,
        restartBlockedUntil,
        now,
        workerCount: getWorkers().length,
        minWorkers: getMinWorkers(),
      })
    ) {
      const minCapacitySpawnAttempt = planClusterSpawnAttempt({
        now,
        lastSpawnAttemptTime,
        restartThrottleMs: RESTART_THROTTLE_MS,
      });
      if (minCapacitySpawnAttempt.shouldSpawn) {
        lastSpawnAttemptTime = minCapacitySpawnAttempt.nextLastSpawnAttemptTime;
        const w = safeFork("min-capacity-restore");
        if (w) {
          wireWorker(w);
        }
      }
    }
  });

  setInterval(evaluateScale, SCALE_INTERVAL_MS);
  logger.info("Cluster master online", {
    workers: INITIAL_WORKERS,
    maxWorkers: getMaxWorkers(),
    minWorkers: getMinWorkers(),
  });
}

// Fatal master-level errors should fail fast so the process supervisor can restart cleanly.
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception in cluster master", { error: err });
  shutdownMasterDueToFatalError("uncaughtException", {
    error: err,
  });
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection in cluster master", { reason });
  shutdownMasterDueToFatalError("unhandledRejection", {
    reason,
  });
});

if (cluster.isPrimary) {
  if (SINGLE_PROCESS_MODE) {
    logger.info("Starting server in single-process mode", {
      maxWorkers: MAX_WORKERS_HARD_CAP,
      reason: "cluster-single-worker-bypass",
    });
    await import("./index-local.js");
  } else {
    bootCluster();
  }
} else {
  // In case this file is accidentally used as worker entry.
  await import("./index-local.js");
}
