import type { Worker } from "node:cluster";
import type cluster from "node:cluster";

import { toControlStateMessage, toGracefulShutdownMessage } from "./cluster-control-state";
import { registerClusterMasterLifecycle, wireClusterMasterWorker } from "./cluster-master-lifecycle";
import { shutdownClusterMasterDueToFatalError } from "./cluster-master-shutdown";
import type {
  ClusterMasterLogger,
  ClusterMasterOrchestratorConfig,
} from "./cluster-master-types";
import { planClusterScaling } from "./cluster-scaling-policy";
import {
  forkClusterWorker,
  pickLeastBusyClusterWorker,
  sendControlStateToWorker,
  sendGracefulShutdownToWorker,
} from "./cluster-worker-runtime";
import { LoadPredictor } from "./loadPredictor";
import type { WorkerControlState, WorkerMetricsPayload } from "./worker-ipc";

type CreateClusterMasterOrchestratorOptions = {
  clusterModule: typeof cluster;
  config: ClusterMasterOrchestratorConfig;
  logger: ClusterMasterLogger;
  workerExec: string;
};

export function createClusterMasterOrchestrator({
  clusterModule,
  config,
  logger,
  workerExec,
}: CreateClusterMasterOrchestratorOptions) {
  const predictor = new LoadPredictor({
    shortWindowSec: 30,
    longWindowSec: 90,
    trendThreshold: 0.2,
    sustainedMs: 30_000,
  });

  const state = {
    workerMetrics: new Map<number, WorkerMetricsPayload>(),
    workerFatalReasons: new Map<number, string>(),
    wiredWorkers: new Set<number>(),
    intentionalExits: new Set<number>(),
    drainingWorkers: new Set<number>(),
    lastSpawnAttemptTime: -Infinity,
    lastBroadcast: null as WorkerControlState | null,
    lowLoadSince: null as number | null,
    preAllocBuffer: null as Buffer | null,
    rollingRestartInProgress: false,
    lastScaleTime: 0,
    unexpectedExitTimestamps: [] as number[],
    restartBlockedUntil: 0,
    lastRestartBlockLogAt: 0,
    fatalStartupLockReason: null as string | null,
    fatalShutdownScheduled: false,
  };
  let scaleIntervalHandle: ReturnType<typeof setInterval> | null = null;
  let gracefulShutdownScheduled = false;

  function getWorkers(): Worker[] {
    return Object.values(clusterModule.workers ?? {}).filter((worker): worker is Worker => Boolean(worker));
  }

  function shutdownMasterDueToFatalError(reason: string, metadata?: Record<string, unknown>) {
    dispose();
    shutdownClusterMasterDueToFatalError({
      reason,
      metadata,
      clusterModule,
      workers: getWorkers(),
      logger,
      createGracefulShutdownMessage: toGracefulShutdownMessage,
      onSchedule: () => {
        if (state.fatalShutdownScheduled) {
          return true;
        }

        state.fatalShutdownScheduled = true;
        return false;
      },
    });
  }

  function startScaleInterval() {
    if (scaleIntervalHandle) {
      return;
    }

    scaleIntervalHandle = setInterval(evaluateScale, config.scaleIntervalMs);
    scaleIntervalHandle.unref();
  }

  function dispose() {
    if (!scaleIntervalHandle) {
      return;
    }

    clearInterval(scaleIntervalHandle);
    scaleIntervalHandle = null;
  }

  function shutdownGracefully(reason: string) {
    if (gracefulShutdownScheduled) {
      return;
    }

    gracefulShutdownScheduled = true;
    dispose();

    const workers = getWorkers();
    logger.info("Cluster master shutting down gracefully", {
      reason,
      workers: workers.length,
    });

    const forceExitTimer = setTimeout(() => {
      process.exit(0);
    }, 25_000);
    forceExitTimer.unref();

    for (const worker of workers) {
      state.intentionalExits.add(worker.id);
      sendGracefulShutdownToWorker({
        worker,
        reason: `master:${reason}`,
        createGracefulShutdownMessage: toGracefulShutdownMessage,
      });
    }

    if (clusterModule.isPrimary && workers.length > 0) {
      try {
        clusterModule.disconnect(() => {
          clearTimeout(forceExitTimer);
          process.exit(0);
        });
        return;
      } catch (error) {
        logger.error("Cluster master disconnect failed during graceful shutdown", {
          reason,
          error,
        });
      }
    }

    setTimeout(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    }, 50).unref();
  }

  function broadcastControl(control: WorkerControlState) {
    state.lastBroadcast = control;

    for (const worker of getWorkers()) {
      sendControlStateToWorker({
        worker,
        control,
        logger,
        createControlStateMessage: toControlStateMessage,
      });
    }
  }

  function safeFork(reason: string): Worker | null {
    if (state.fatalStartupLockReason) {
      logger.error("Spawn blocked due to fatal startup condition", {
        fatalStartupLockReason: state.fatalStartupLockReason,
        spawnReason: reason,
      });
      return null;
    }

    const now = Date.now();
    if (now < state.restartBlockedUntil) {
      if (now - state.lastRestartBlockLogAt > 5_000) {
        const remainingMs = Math.max(0, state.restartBlockedUntil - now);
        logger.error("Restart temporarily blocked", {
          remainingSeconds: Math.ceil(remainingMs / 1000),
          spawnReason: reason,
        });
        state.lastRestartBlockLogAt = now;
      }
      return null;
    }

    const aliveWorkers = getWorkers().filter((worker) => !worker.isDead() && worker.isConnected());
    if (aliveWorkers.length >= config.maxWorkers) {
      logger.warn("Max workers reached; skipping spawn", {
        maxWorkers: config.maxWorkers,
        spawnReason: reason,
      });
      return null;
    }

    return forkClusterWorker({
      clusterModule,
      reason,
      logger,
    });
  }

  function spawnWorker(reason: string): boolean {
    return safeFork(reason) !== null;
  }

  async function drainAndRestartWorker(worker: Worker, reason: string) {
    if (state.drainingWorkers.has(worker.id)) return;
    state.drainingWorkers.add(worker.id);
    state.intentionalExits.add(worker.id);
    sendGracefulShutdownToWorker({
      worker,
      reason,
      createGracefulShutdownMessage: toGracefulShutdownMessage,
    });

    const timeout = setTimeout(() => {
      try {
        worker.kill();
      } catch {
        // Ignore best-effort worker termination failures.
      }
    }, 30_000);

    worker.once("exit", () => {
      clearTimeout(timeout);
      state.drainingWorkers.delete(worker.id);
    });
  }

  async function rollingRestartOne(reason: string) {
    if (state.rollingRestartInProgress) return;
    const workers = getWorkers().filter((worker) => !state.drainingWorkers.has(worker.id));
    if (workers.length <= config.minWorkers) return;

    state.rollingRestartInProgress = true;
    try {
      const candidate = pickLeastBusyClusterWorker({
        workers,
        getActiveRequests: (workerId) => state.workerMetrics.get(workerId)?.activeRequests ?? 0,
      });
      if (!candidate) {
        return;
      }
      await drainAndRestartWorker(candidate, reason);
    } finally {
      setTimeout(() => {
        state.rollingRestartInProgress = false;
      }, 10_000);
    }
  }

  function evaluateScale() {
    const workers = getWorkers();
    const metricSamples = Array.from(state.workerMetrics.values());
    const now = Date.now();
    const trend = predictor.update({
      ts: now,
      requestRate: metricSamples.reduce((sum, sample) => sum + sample.reqRate, 0),
      latencyP95Ms: metricSamples.reduce((max, sample) => Math.max(max, sample.latencyP95Ms), 0),
      cpuPercent: metricSamples.length > 0
        ? metricSamples.reduce((sum, sample) => sum + sample.cpuPercent, 0) / metricSamples.length
        : 0,
    });

    const timeSinceLastScale = now - state.lastScaleTime;
    const canScale = timeSinceLastScale >= config.scaleCooldownMs;
    const memUsageMB = process.memoryUsage().rss / 1024 / 1024;
    const memoryScaleUpBlockMB = config.lowMemoryMode ? 220 : 1200;
    const plan = planClusterScaling({
      workerMetrics: metricSamples,
      trend,
      workerCount: workers.length,
      maxWorkers: config.maxWorkers,
      canScale,
      now,
      lowLoadSince: state.lowLoadSince,
      lowLoadHoldMs: config.lowLoadHoldMs,
      lowReqRateThreshold: config.lowReqRateThreshold,
      activeRequestsThreshold: config.activeRequestsThreshold,
      preallocateMb: config.preallocateMb,
      maxSpawnPerCycle: config.maxSpawnPerCycle,
      hasPreAllocBuffer: Boolean(state.preAllocBuffer),
      processRssMb: memUsageMB,
      memoryScaleUpBlockMb: memoryScaleUpBlockMB,
    });

    if (plan.memoryPressureHigh) {
      logger.warn("High memory detected; skipping scale up", {
        memoryUsageMB: Math.round(memUsageMB),
      });
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
        state.lastScaleTime = now;
      }
    }

    if (plan.shouldAllocatePrealloc) {
      state.preAllocBuffer = Buffer.alloc(config.preallocateMb * 1024 * 1024);
    } else if (plan.shouldReleasePrealloc) {
      state.preAllocBuffer = null;
    }

    state.lowLoadSince = plan.nextLowLoadSince;

    if (plan.shouldScaleDown) {
      void rollingRestartOne("scale-down-low-load");
    }

    if (plan.shouldRestartForMemoryPressure) {
      void rollingRestartOne("memory-pressure");
    }

    broadcastControl(plan.control);
  }

  function bootCluster() {
    clusterModule.setupPrimary({
      exec: workerExec,
    });

    for (let index = 0; index < config.initialWorkers; index += 1) {
      const worker = safeFork("initial-boot");
      if (worker) {
        wireClusterMasterWorker({
          worker,
          logger,
          restartBlockMs: config.restartBlockMs,
          state,
          controls: {
            rollingRestartOne,
          },
        });
      }
    }

    registerClusterMasterLifecycle({
      clusterModule,
      config,
      logger,
      state,
      controls: {
        getWorkers,
        rollingRestartOne,
        safeFork,
        shutdownMasterDueToFatalError,
      },
    });

    startScaleInterval();
    logger.info("Cluster master online", {
      workers: config.initialWorkers,
      maxWorkers: config.maxWorkers,
      minWorkers: config.minWorkers,
    });
  }

  function handleUncaughtException(error: unknown) {
    logger.error("Uncaught exception in cluster master", { error });
    shutdownMasterDueToFatalError("uncaughtException", { error });
  }

  function handleUnhandledRejection(reason: unknown) {
    logger.error("Unhandled rejection in cluster master", { reason });
    shutdownMasterDueToFatalError("unhandledRejection", { reason });
  }

  return {
    bootCluster,
    dispose,
    handleUncaughtException,
    handleUnhandledRejection,
    shutdownGracefully,
  };
}
