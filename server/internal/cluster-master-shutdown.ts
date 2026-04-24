import type { Worker } from "node:cluster";
import type { Serializable } from "node:child_process";

type ClusterLike = {
  isPrimary: boolean;
  disconnect: (callback?: () => void) => void;
};

type LoggerLike = {
  error: (message: string, metadata?: Record<string, unknown>) => void;
};

export function shutdownClusterMasterDueToFatalError(params: {
  reason: string;
  metadata?: Record<string, unknown> | undefined;
  clusterModule: ClusterLike;
  workers: Worker[];
  logger: LoggerLike;
  createGracefulShutdownMessage: (reason: string) => Serializable;
  onSchedule?: (() => boolean) | undefined;
}): void {
  if (params.onSchedule && params.onSchedule()) {
    return;
  }

  process.exitCode = 1;
  params.logger.error("Cluster master shutting down due to unrecoverable error", {
    reason: params.reason,
    ...params.metadata,
  });

  const forceExitTimer = setTimeout(() => {
    process.exit(1);
  }, 5_000);
  forceExitTimer.unref();

  for (const worker of params.workers) {
    if (!worker.isConnected() || worker.isDead()) {
      continue;
    }

    try {
      worker.send(params.createGracefulShutdownMessage(`master-fatal:${params.reason}`));
    } catch (error) {
      params.logger.error("Failed to notify cluster worker about fatal master shutdown", {
        reason: params.reason,
        workerId: worker.id,
        workerPid: worker.process.pid,
        error,
      });
    }
  }

  if (params.clusterModule.isPrimary && params.workers.length > 0) {
    try {
      params.clusterModule.disconnect(() => {
        clearTimeout(forceExitTimer);
        process.exit(1);
      });
      return;
    } catch (error) {
      params.logger.error("Cluster master disconnect failed during fatal shutdown", {
        reason: params.reason,
        error,
      });
    }
  }

  setTimeout(() => {
    clearTimeout(forceExitTimer);
    process.exit(1);
  }, 50).unref();
}
