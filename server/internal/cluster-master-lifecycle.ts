import type { Worker } from "node:cluster";
import type cluster from "node:cluster";

import { toControlStateMessage } from "./cluster-control-state";
import {
  planClusterSpawnAttempt,
  recordUnexpectedWorkerExit,
  shouldRestoreMinimumClusterCapacity,
} from "./cluster-restart-policy";
import type {
  ClusterMasterLogger,
  ClusterMasterOrchestratorConfig,
} from "./cluster-master-types";
import { parseClusterWorkerMessage } from "./cluster-worker-message-policy";
import { sendControlStateToWorker } from "./cluster-worker-runtime";
import type { WorkerControlState, WorkerMetricsPayload } from "./worker-ipc";

type ClusterMasterMutableState = {
  workerMetrics: Map<number, WorkerMetricsPayload>;
  workerFatalReasons: Map<number, string>;
  wiredWorkers: Set<number>;
  intentionalExits: Set<number>;
  drainingWorkers: Set<number>;
  lastSpawnAttemptTime: number;
  lastBroadcast: WorkerControlState | null;
  unexpectedExitTimestamps: number[];
  restartBlockedUntil: number;
  lastRestartBlockLogAt: number;
  fatalStartupLockReason: string | null;
};

type ClusterMasterLifecycleControls = {
  getWorkers: () => Worker[];
  safeFork: (reason: string) => Worker | null;
  rollingRestartOne: (reason: string) => Promise<void>;
  shutdownMasterDueToFatalError: (reason: string, metadata?: Record<string, unknown>) => void;
};

type RegisterClusterMasterLifecycleOptions = {
  clusterModule: typeof cluster;
  config: ClusterMasterOrchestratorConfig;
  logger: ClusterMasterLogger;
  state: ClusterMasterMutableState;
  controls: ClusterMasterLifecycleControls;
};

export function wireClusterMasterWorker(options: {
  logger: ClusterMasterLogger;
  restartBlockMs: number;
  state: ClusterMasterMutableState;
  controls: Pick<ClusterMasterLifecycleControls, "rollingRestartOne">;
  worker: Worker;
}) {
  const { controls, logger, state, worker } = options;

  if (state.wiredWorkers.has(worker.id)) {
    return;
  }
  state.wiredWorkers.add(worker.id);

  worker.on("message", (message: unknown) => {
    const outcome = parseClusterWorkerMessage(message);
    if (outcome.kind === "fatal") {
      state.workerFatalReasons.set(worker.id, outcome.reason);

      if (outcome.shouldLockAutomaticRestart) {
        state.fatalStartupLockReason = outcome.reason;
        state.restartBlockedUntil = Date.now() + options.restartBlockMs;
        state.lastRestartBlockLogAt = Date.now();
        logger.error("Worker reported fatal error and auto-restart is disabled", {
          workerId: worker.id,
          reason: outcome.reason,
        });
      } else {
        logger.error("Worker reported fatal error", {
          workerId: worker.id,
          reason: outcome.reason,
        });
      }
      return;
    }

    if (outcome.kind === "metrics") {
      state.workerMetrics.set(worker.id, {
        ...outcome.payload,
        workerId: worker.id,
        pid: worker.process.pid ?? outcome.payload.pid,
      });
      return;
    }

    if (outcome.kind === "memory-pressure") {
      void controls.rollingRestartOne("worker-memory-pressure");
    }
  });
}

export function registerClusterMasterLifecycle(options: RegisterClusterMasterLifecycleOptions) {
  const { clusterModule, config, controls, logger, state } = options;

  clusterModule.on("online", (worker) => {
    wireClusterMasterWorker({
      worker,
      logger,
      restartBlockMs: config.restartBlockMs,
      state,
      controls,
    });
    if (state.lastBroadcast) {
      sendControlStateToWorker({
        worker,
        control: state.lastBroadcast,
        logger,
        createControlStateMessage: toControlStateMessage,
      });
    }
  });

  clusterModule.on("exit", (worker, code, signal) => {
    state.workerMetrics.delete(worker.id);
    state.wiredWorkers.delete(worker.id);
    state.drainingWorkers.delete(worker.id);
    const fatalReason = state.workerFatalReasons.get(worker.id);
    state.workerFatalReasons.delete(worker.id);

    if (fatalReason === "EADDRINUSE") {
      state.fatalStartupLockReason = "EADDRINUSE";
      logger.error("Worker exited due to EADDRINUSE; skipping automatic restart", {
        workerId: worker.id,
        code,
        signal,
      });
      if (controls.getWorkers().length === 0) {
        controls.shutdownMasterDueToFatalError("EADDRINUSE");
      }
      return;
    }

    const intentional = state.intentionalExits.has(worker.id);
    if (intentional) {
      state.intentionalExits.delete(worker.id);
    } else {
      const now = Date.now();
      const unexpectedExitOutcome = recordUnexpectedWorkerExit({
        now,
        unexpectedExitTimestamps: state.unexpectedExitTimestamps,
        restartFailureWindowMs: config.restartFailureWindowMs,
        maxRestartAttempts: config.maxRestartAttempts,
        restartBlockMs: config.restartBlockMs,
      });
      state.unexpectedExitTimestamps = unexpectedExitOutcome.nextUnexpectedExitTimestamps;

      if (unexpectedExitOutcome.shouldBlockRestarts) {
        state.restartBlockedUntil = unexpectedExitOutcome.restartBlockedUntil ?? state.restartBlockedUntil;
        state.lastRestartBlockLogAt = now;
        logger.error("Crash loop detected; pausing worker restarts", {
          workerId: worker.id,
          code,
          maxRestartAttempts: config.maxRestartAttempts,
          failureWindowSeconds: Math.round(config.restartFailureWindowMs / 1000),
          restartBlockSeconds: Math.round(config.restartBlockMs / 1000),
        });
        return;
      }

      logger.error("Worker exited unexpectedly; attempting restart", {
        workerId: worker.id,
        code,
        signal,
      });

      const restartSpawnAttempt = planClusterSpawnAttempt({
        now,
        lastSpawnAttemptTime: state.lastSpawnAttemptTime,
        restartThrottleMs: config.restartThrottleMs,
      });
      if (restartSpawnAttempt.shouldSpawn) {
        state.lastSpawnAttemptTime = restartSpawnAttempt.nextLastSpawnAttemptTime;
        const replacementWorker = controls.safeFork("unexpected-exit-restart");
        if (replacementWorker) {
          wireClusterMasterWorker({
            worker: replacementWorker,
            logger,
            restartBlockMs: config.restartBlockMs,
            state,
            controls,
          });
          logger.info("Spawned replacement worker in response to failure", {
            workerId: replacementWorker.id,
          });
        } else {
          logger.warn("Failed to spawn replacement worker", { workerId: worker.id });
        }
      } else {
        logger.info("Throttling worker restart because a spawn was attempted recently", {
          workerId: worker.id,
          remainingDelayMs: restartSpawnAttempt.remainingDelayMs,
        });
      }
    }

    const now = Date.now();
    if (
      shouldRestoreMinimumClusterCapacity({
        fatalStartupLockReason: state.fatalStartupLockReason,
        restartBlockedUntil: state.restartBlockedUntil,
        now,
        workerCount: controls.getWorkers().length,
        minWorkers: config.minWorkers,
      })
    ) {
      const minCapacitySpawnAttempt = planClusterSpawnAttempt({
        now,
        lastSpawnAttemptTime: state.lastSpawnAttemptTime,
        restartThrottleMs: config.restartThrottleMs,
      });
      if (minCapacitySpawnAttempt.shouldSpawn) {
        state.lastSpawnAttemptTime = minCapacitySpawnAttempt.nextLastSpawnAttemptTime;
        const restoredWorker = controls.safeFork("min-capacity-restore");
        if (restoredWorker) {
          wireClusterMasterWorker({
            worker: restoredWorker,
            logger,
            restartBlockMs: config.restartBlockMs,
            state,
            controls,
          });
        }
      }
    }
  });
}
