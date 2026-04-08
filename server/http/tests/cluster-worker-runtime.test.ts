import assert from "node:assert/strict";
import test from "node:test";
import {
  forkClusterWorker,
  pickLeastBusyClusterWorker,
  sendControlStateToWorker,
  sendGracefulShutdownToWorker,
} from "../../internal/cluster-worker-runtime";
import { parseClusterWorkerMessage } from "../../internal/cluster-worker-message-policy";
import type { WorkerControlState, WorkerMetricsPayload } from "../../internal/worker-ipc";

function createLogger() {
  return {
    infoCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    warnCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    errorCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    info(message: string, metadata?: Record<string, unknown>) {
      this.infoCalls.push({ message, metadata });
    },
    warn(message: string, metadata?: Record<string, unknown>) {
      this.warnCalls.push({ message, metadata });
    },
    error(message: string, metadata?: Record<string, unknown>) {
      this.errorCalls.push({ message, metadata });
    },
  };
}

function createWorker(overrides: Partial<{
  id: number;
  connected: boolean;
  dead: boolean;
}> = {}) {
  const handlers = new Map<string, Function[]>();
  const sent: unknown[] = [];
  const worker = {
    id: overrides.id ?? 1,
    isConnected: () => overrides.connected ?? true,
    isDead: () => overrides.dead ?? false,
    send: (message: unknown) => {
      sent.push(message);
      return true;
    },
    on: (event: string, handler: Function) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return worker;
    },
    sent,
    handlers,
  };
  return worker;
}

const sampleControlState: WorkerControlState = {
  mode: "NORMAL",
  healthScore: 100,
  dbProtection: false,
  rejectHeavyRoutes: false,
  throttleFactor: 1,
  predictor: {
    requestRateMA: 0,
    latencyMA: 0,
    cpuMA: 0,
    requestRateTrend: 0,
    latencyTrend: 0,
    cpuTrend: 0,
    sustainedUpward: false,
    lastUpdatedAt: null,
  },
  workerCount: 1,
  maxWorkers: 4,
  queueLength: 0,
  preAllocateMB: 0,
  updatedAt: 123,
  workers: [],
  circuits: {
    aiOpenWorkers: 0,
    dbOpenWorkers: 0,
    exportOpenWorkers: 0,
  },
};

test("cluster worker runtime helpers send IPC messages only to connected workers and choose least busy worker", () => {
  const logger = createLogger();
  const readyWorker = createWorker({ id: 10 });
  const deadWorker = createWorker({ id: 11, dead: true });
  const controlSent = sendControlStateToWorker({
    worker: readyWorker as never,
    control: sampleControlState,
    logger,
    createControlStateMessage: (control) => ({ type: "control-state", payload: control }),
  });
  const shutdownSent = sendGracefulShutdownToWorker({
    worker: readyWorker as never,
    reason: "rolling-restart",
    createGracefulShutdownMessage: (reason) => ({ type: "graceful-shutdown", reason }),
  });
  const skipped = sendControlStateToWorker({
    worker: deadWorker as never,
    control: sampleControlState,
    logger,
    createControlStateMessage: (control) => ({ type: "control-state", payload: control }),
  });

  const chosen = pickLeastBusyClusterWorker({
    workers: [readyWorker as never, deadWorker as never],
    getActiveRequests: (workerId) => (workerId === 10 ? 4 : 1),
  });

  assert.equal(controlSent, true);
  assert.equal(shutdownSent, true);
  assert.equal(skipped, false);
  assert.equal(readyWorker.sent.length, 2);
  assert.equal(chosen?.id, 11);
});

test("cluster worker runtime forks workers with lifecycle listeners and message policy classifies worker IPC safely", () => {
  const logger = createLogger();
  const forkedWorker = createWorker({ id: 7 });
  const clusterModule = {
    fork: () => forkedWorker as never,
  };

  const worker = forkClusterWorker({
    clusterModule,
    reason: "initial-boot",
    logger,
  });

  const metricsPayload: WorkerMetricsPayload = {
    workerId: 7,
    pid: 7007,
    cpuPercent: 50,
    reqRate: 10,
    latencyP95Ms: 200,
    eventLoopLagMs: 20,
    activeRequests: 3,
    queueLength: 1,
    heapUsedMB: 100,
    heapTotalMB: 200,
    oldSpaceMB: 60,
    gcPerMin: 1,
    dbLatencyMs: 120,
    aiLatencyMs: 180,
    ts: 123,
    circuit: {
      ai: { state: "CLOSED", failureRate: 0 },
      db: { state: "CLOSED", failureRate: 0 },
      export: { state: "CLOSED", failureRate: 0 },
    },
  };

  assert.equal(worker?.id, 7);
  assert.equal(forkedWorker.handlers.has("error"), true);
  assert.equal(forkedWorker.handlers.has("disconnect"), true);
  assert.equal(logger.infoCalls.length, 1);

  assert.deepEqual(
    parseClusterWorkerMessage({ type: "worker-event", payload: { kind: "memory-pressure" } }),
    { kind: "memory-pressure" },
  );
  assert.deepEqual(
    parseClusterWorkerMessage({ type: "worker-metrics", payload: metricsPayload }),
    { kind: "metrics", payload: metricsPayload },
  );
  assert.deepEqual(
    parseClusterWorkerMessage({
      type: "worker-fatal",
      payload: { reason: "EADDRINUSE", details: "bind failed" },
    }),
    { kind: "fatal", reason: "EADDRINUSE", shouldLockAutomaticRestart: true },
  );
});
