import "dotenv/config";
import cluster, { type Worker } from "node:cluster";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeConfig } from "./config/runtime";
import { normalizeInitialWorkerCount, shouldUseSingleProcessMode } from "./internal/cluster-mode";
import {
  aggregateClusterMetrics,
  buildWorkerControlState,
  toControlStateMessage,
  toGracefulShutdownMessage,
} from "./internal/cluster-control-state";
import { shutdownClusterMasterDueToFatalError } from "./internal/cluster-master-shutdown";
import { logger } from "./lib/logger";
import { LoadPredictor, type LoadTrendSnapshot } from "./internal/loadPredictor";
import {
  isWorkerFatalMessage,
  isWorkerMemoryPressureMessage,
  isWorkerMetricsMessage,
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
const restartAttempts = new Map<number, number>(); // Track restart attempts per worker
let lastRestartTime = -Infinity; // Initialize to allow first restart immediately
let lastSpawnAttemptTime = -Infinity; // Track actual spawn attempts (not exits)
let lastBroadcast: WorkerControlState | null = null;
let lowLoadSince: number | null = null;
let mode: WorkerControlState["mode"] = "NORMAL";
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
    // SAFE SEND: Check worker is alive before sending IPC
    if (!worker || !worker.isConnected() || worker.isDead()) {
      continue;
    }

    try {
      worker.send(toControlStateMessage(control));
    } catch (err) {
      // Silently skip if send fails (worker may have disconnected)
      logger.warn("Failed to send control-state to worker", { workerId: worker.id, error: err });
    }
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

  try {
    const worker = cluster.fork({ ...process.env, SQR_CLUSTER_WORKER: "1" });
    logger.info("Spawned worker", { workerId: worker.id, spawnReason: reason });

    // Prevent IPC crash on worker errors
    worker.on("error", (err) => {
      logger.error("Worker emitted error", { workerId: worker.id, error: err });
    });

    worker.on("disconnect", () => {
      logger.warn("Worker disconnected", { workerId: worker.id });
    });

    return worker;
  } catch (err) {
    logger.error("Failed to fork worker", { spawnReason: reason, error: err });
    return null;
  }
}

function spawnWorker(reason: string): boolean {
  return safeFork(reason) !== null;
}

async function drainAndRestartWorker(worker: Worker, reason: string) {
  if (drainingWorkers.has(worker.id)) return;
  drainingWorkers.add(worker.id);
  intentionalExits.add(worker.id);
  if (worker.isConnected() && !worker.isDead()) {
    try {
      worker.send(toGracefulShutdownMessage(reason));
    } catch {
      // Ignore IPC send failure; timeout/kill fallback below will still apply.
    }
  }

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
    let candidate = workers[0];
    let minActive = Number.MAX_SAFE_INTEGER;
    for (const w of workers) {
      const active = workerMetrics.get(w.id)?.activeRequests ?? 0;
      if (active < minActive) {
        minActive = active;
        candidate = w;
      }
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
  const agg = aggregateClusterMetrics(metricSamples);
  const trend = predictor.update({
    ts: Date.now(),
    requestRate: agg.reqRate,
    latencyP95Ms: agg.p95,
    cpuPercent: agg.cpuPercent,
  });

  // SCALE COOLDOWN: Prevent rapid spawn loops
  const now = Date.now();
  const timeSinceLastScale = now - lastScaleTime;
  const canScale = timeSinceLastScale >= SCALE_COOLDOWN_MS;

  // MEMORY PROTECTION: Skip scaling on high memory usage
  const memUsageMB = process.memoryUsage().rss / 1024 / 1024;
  const memoryScaleUpBlockMB = LOW_MEMORY_MODE ? 220 : 1200;
  const memoryPressureHigh = memUsageMB > memoryScaleUpBlockMB;

  if (memoryPressureHigh) {
    logger.warn("High memory detected; skipping scale up", { memoryUsageMB: Math.round(memUsageMB) });
  }

  // Predictive actions before overload.
  if (trend.sustainedUpward && canScale && !memoryPressureHigh) {
    let spawned = 0;
    while (spawned < MAX_SPAWN_PER_CYCLE && workers.length + spawned < maxWorkers) {
      if (!spawnWorker("predictive-uptrend")) break;
      spawned += 1;
      lastScaleTime = now;
    }
    if (PREALLOCATE_MB > 0 && !preAllocBuffer) {
      preAllocBuffer = Buffer.alloc(PREALLOCATE_MB * 1024 * 1024);
    }
  } else if (preAllocBuffer && agg.cpuPercent < 55 && agg.reqRate < LOW_REQ_RATE_THRESHOLD) {
    preAllocBuffer = null;
  }

  // Reactive scale-up rules (with cooldown & memory checks).
  const latencyPressure = agg.p95 > 900 && agg.reqRate > LOW_REQ_RATE_THRESHOLD;
  const highLoad =
    agg.cpuPercent > 70 ||
    latencyPressure ||
    agg.activeRequests > ACTIVE_REQUESTS_THRESHOLD * Math.max(1, workers.length);

  if (highLoad && canScale && !memoryPressureHigh) {
    if (spawnWorker("reactive-high-load")) {
      lastScaleTime = now;
    }
  }

  // Scale-down rules.
  const lowLoad = agg.cpuPercent < 40 && agg.reqRate < LOW_REQ_RATE_THRESHOLD;
  if (lowLoad) {
    if (lowLoadSince === null) lowLoadSince = Date.now();
    const longEnough = Date.now() - lowLoadSince >= LOW_LOAD_HOLD_MS;
    if (longEnough && workers.length > getMinWorkers()) {
      rollingRestartOne("scale-down-low-load").catch(() => undefined);
      lowLoadSince = Date.now();
    }
  } else {
    lowLoadSince = null;
  }

  // Memory protection restart.
  const memoryPressure =
    agg.heapUsedMB > 0 &&
    agg.oldSpaceMB / Math.max(agg.heapUsedMB, 1) > 0.75 &&
    agg.heapUsedMB > 1024;
  if (memoryPressure) {
    rollingRestartOne("memory-pressure").catch(() => undefined);
  }

  const control = buildWorkerControlState({
    workerMetrics: metricSamples,
    trend,
    workerCount: workers.length,
    maxWorkers,
    preallocateMb: PREALLOCATE_MB > 0 && trend.sustainedUpward ? PREALLOCATE_MB : 0,
  });
  mode = control.mode;
  broadcastControl(control);
}

function wireWorker(worker: Worker) {
  if (wiredWorkers.has(worker.id)) return;
  wiredWorkers.add(worker.id);

  worker.on("message", (message: unknown) => {
    if (isWorkerFatalMessage(message)) {
      const reason = message.payload.reason || "UNKNOWN_FATAL";
      workerFatalReasons.set(worker.id, reason);

      if (reason === "EADDRINUSE") {
        fatalStartupLockReason = reason;
        restartBlockedUntil = Date.now() + RESTART_BLOCK_MS;
        lastRestartBlockLogAt = Date.now();
        logger.error("Worker reported fatal startup error and auto-restart is disabled", {
          workerId: worker.id,
          reason,
        });
      } else {
        logger.error("Worker reported fatal startup error", { workerId: worker.id, reason });
      }
      return;
    }

    if (isWorkerMetricsMessage(message)) {
      const payload = message.payload;
      workerMetrics.set(worker.id, { ...payload, workerId: worker.id, pid: worker.process.pid ?? payload.pid });
      return;
    }
    if (isWorkerMemoryPressureMessage(message)) {
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
      // Safe send with connection check
      if (worker.isConnected() && !worker.isDead()) {
        try {
          worker.send(toControlStateMessage(lastBroadcast));
        } catch {
          // Ignore if send fails
        }
      }
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
      restartAttempts.delete(worker.id);
    } else {
      // Restart Throttling & Circuit Breaker: Prevent infinite loops
      const now = Date.now();
      const timeSinceLastSpawn = now - lastSpawnAttemptTime;

      // Check if we've exceeded restart threshold inside rolling window
      unexpectedExitTimestamps = unexpectedExitTimestamps.filter(
        (ts) => now - ts <= RESTART_FAILURE_WINDOW_MS,
      );
      unexpectedExitTimestamps.push(now);

      if (unexpectedExitTimestamps.length > MAX_RESTART_ATTEMPTS) {
        restartBlockedUntil = now + RESTART_BLOCK_MS;
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
      if (timeSinceLastSpawn >= RESTART_THROTTLE_MS) {
        lastSpawnAttemptTime = now; // Mark spawn attempt NOW (before actual fork)
        const w = safeFork("unexpected-exit-restart");
        if (w) {
          wireWorker(w);
          logger.info("Spawned replacement worker in response to failure", { workerId: w.id });
        } else {
          logger.warn("Failed to spawn replacement worker", { workerId: worker.id });
        }
      } else {
        // We just spawned within the throttle window - don't spawn again yet
        const remainingDelay = RESTART_THROTTLE_MS - timeSinceLastSpawn;
        logger.info("Throttling worker restart because a spawn was attempted recently", {
          workerId: worker.id,
          remainingDelayMs: remainingDelay,
        });
      }
    }

    // Keep minimum worker availability (but respect throttle and restart block)
    if (fatalStartupLockReason) {
      return;
    }
    if (Date.now() < restartBlockedUntil) {
      return;
    }
    if (getWorkers().length < getMinWorkers()) {
      const now = Date.now();
      if (now - lastSpawnAttemptTime >= RESTART_THROTTLE_MS) {
        lastSpawnAttemptTime = now;
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
