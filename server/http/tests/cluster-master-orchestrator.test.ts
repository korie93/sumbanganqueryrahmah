import assert from "node:assert/strict";
import type cluster from "node:cluster";
import test from "node:test";

import { createClusterMasterOrchestrator } from "../../internal/cluster-master-orchestrator";

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

function createWorker(workerId = 1) {
  const handlers = new Map<string, Function[]>();
  const worker = {
    id: workerId,
    process: { pid: 10_000 + workerId },
    isConnected: () => true,
    isDead: () => false,
    send: () => true,
    kill: () => undefined,
    on(event: string, handler: Function) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return worker;
    },
    once(event: string, handler: Function) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return worker;
    },
  };

  return {
    handlers,
    worker,
  };
}

test("cluster master orchestrator boots primary workers and registers lifecycle handlers", () => {
  const logger = createLogger();
  const { worker } = createWorker(1);
  const workers: Record<number, unknown> = {};
  const clusterHandlers = new Map<string, Function>();
  let setupPrimaryOptions: { exec?: string } | undefined;

  const clusterModule = {
    workers,
    setupPrimary(options: { exec?: string }) {
      setupPrimaryOptions = options;
    },
    fork() {
      workers[worker.id] = worker;
      return worker;
    },
    on(event: string, handler: Function) {
      clusterHandlers.set(event, handler);
      return clusterModule;
    },
  } as unknown as typeof cluster;

  const originalSetInterval = globalThis.setInterval;
  const intervalHandles: unknown[] = [];
  globalThis.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const intervalHandle = originalSetInterval(handler, timeout, ...args);
    intervalHandles.push(intervalHandle);
    return intervalHandle;
  }) as typeof setInterval;

  try {
    const orchestrator = createClusterMasterOrchestrator({
      clusterModule,
      logger,
      workerExec: "dist-local/server/index-local.js",
      config: {
        scaleIntervalMs: 5_000,
        lowLoadHoldMs: 60_000,
        activeRequestsThreshold: 80,
        lowReqRateThreshold: 8,
        lowMemoryMode: false,
        preallocateMb: 0,
        maxSpawnPerCycle: 1,
        maxWorkers: 2,
        minWorkers: 1,
        initialWorkers: 1,
        scaleCooldownMs: 15_000,
        restartThrottleMs: 2_000,
        maxRestartAttempts: 5,
        restartFailureWindowMs: 60_000,
        restartBlockMs: 60_000,
      },
    });

    orchestrator.bootCluster();

    assert.deepEqual(setupPrimaryOptions, {
      exec: "dist-local/server/index-local.js",
    });
    assert.equal(Object.keys(workers).length, 1);
    assert.equal(clusterHandlers.has("online"), true);
    assert.equal(clusterHandlers.has("exit"), true);
    assert.equal(
      logger.infoCalls.some((entry) => entry.message === "Cluster master online"),
      true,
    );
  } finally {
    globalThis.setInterval = originalSetInterval;
    for (const intervalHandle of intervalHandles) {
      clearInterval(intervalHandle as Parameters<typeof clearInterval>[0]);
    }
  }
});
