import type cluster from "node:cluster";
import type { Serializable } from "node:child_process";
import type { Worker } from "node:cluster";
import type { WorkerControlState } from "./worker-ipc";

type LoggerLike = {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
};

type ClusterLike = {
  fork: (env?: NodeJS.ProcessEnv) => Worker;
};

export function isConnectedClusterWorker(worker: Worker | null | undefined): worker is Worker {
  if (!worker) {
    return false;
  }

  return worker.isConnected() && !worker.isDead();
}

export function sendControlStateToWorker(params: {
  worker: Worker;
  control: WorkerControlState;
  logger: LoggerLike;
  createControlStateMessage: (control: WorkerControlState) => Serializable;
}): boolean {
  const worker = params.worker;

  if (!isConnectedClusterWorker(worker)) {
    return false;
  }

  try {
    worker.send(params.createControlStateMessage(params.control));
    return true;
  } catch (error) {
    params.logger.warn("Failed to send control-state to worker", {
      workerId: worker.id,
      error,
    });
    return false;
  }
}

export function sendGracefulShutdownToWorker(params: {
  worker: Worker;
  reason: string;
  createGracefulShutdownMessage: (reason: string) => Serializable;
}): boolean {
  const worker = params.worker;

  if (!isConnectedClusterWorker(worker)) {
    return false;
  }

  try {
    worker.send(params.createGracefulShutdownMessage(params.reason));
    return true;
  } catch {
    return false;
  }
}

export function forkClusterWorker(params: {
  clusterModule: ClusterLike;
  reason: string;
  logger: LoggerLike;
}): Worker | null {
  try {
    const worker = params.clusterModule.fork({ ...process.env, SQR_CLUSTER_WORKER: "1" });
    params.logger.info("Spawned worker", {
      workerId: worker.id,
      spawnReason: params.reason,
    });

    worker.on("error", (error) => {
      params.logger.error("Worker emitted error", { workerId: worker.id, error });
    });

    worker.on("disconnect", () => {
      params.logger.warn("Worker disconnected", { workerId: worker.id });
    });

    return worker;
  } catch (error) {
    params.logger.error("Failed to fork worker", {
      spawnReason: params.reason,
      error,
    });
    return null;
  }
}

export function pickLeastBusyClusterWorker(params: {
  workers: Worker[];
  getActiveRequests: (workerId: number) => number;
}): Worker | null {
  if (params.workers.length === 0) {
    return null;
  }

  let candidate = params.workers[0];
  let minActive = Number.MAX_SAFE_INTEGER;
  for (const worker of params.workers) {
    const active = params.getActiveRequests(worker.id);
    if (active < minActive) {
      minActive = active;
      candidate = worker;
    }
  }

  return candidate;
}
