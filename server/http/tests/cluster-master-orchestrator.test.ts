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
  const originalClearInterval = globalThis.clearInterval;
  let intervalUnrefCalls = 0;
  const intervalHandle = {
    unref() {
      intervalUnrefCalls += 1;
    },
  } as unknown as ReturnType<typeof setInterval>;
  const clearedIntervalHandles: Array<Parameters<typeof clearInterval>[0]> = [];
  let scaleIntervalMs: number | undefined;
  globalThis.setInterval = (((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    void handler;
    void args;
    scaleIntervalMs = timeout;
    return intervalHandle;
  }) as unknown) as typeof setInterval;
  globalThis.clearInterval = (((handle?: Parameters<typeof clearInterval>[0]) => {
    if (handle) {
      clearedIntervalHandles.push(handle);
    }
  }) as unknown) as typeof clearInterval;

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
    assert.equal(scaleIntervalMs, 5_000);
    assert.equal(intervalUnrefCalls, 1);

    orchestrator.dispose();
    orchestrator.dispose();

    assert.deepEqual(clearedIntervalHandles, [intervalHandle]);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("cluster master orchestrator logs when a draining worker cannot be force-killed", async () => {
  const logger = createLogger();
  const firstWorker = createWorker(1);
  const secondWorker = createWorker(2);
  firstWorker.worker.kill = () => {
    throw new Error("kill failed");
  };
  secondWorker.worker.kill = () => {
    throw new Error("kill failed");
  };
  const workers: Record<number, unknown> = {};
  const clusterHandlers = new Map<string, Function>();
  let intervalHandler: (() => void) | undefined;
  const timeoutHandlers: Array<() => void> = [];

  const clusterModule = {
    workers,
    isPrimary: true,
    setupPrimary() {
      return undefined;
    },
    fork() {
      throw new Error("unexpected fork");
    },
    on(event: string, handler: Function) {
      clusterHandlers.set(event, handler);
      return clusterModule;
    },
  } as unknown as typeof cluster;

  workers[firstWorker.worker.id] = firstWorker.worker;
  workers[secondWorker.worker.id] = secondWorker.worker;

  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setInterval = (((handler: TimerHandler) => {
    intervalHandler = handler as () => void;
    return { unref() {} } as ReturnType<typeof setInterval>;
  }) as unknown) as typeof setInterval;
  globalThis.clearInterval = (((_handle?: Parameters<typeof clearInterval>[0]) => {
    return undefined;
  }) as unknown) as typeof clearInterval;
  globalThis.setTimeout = (((handler: TimerHandler) => {
    timeoutHandlers.push(handler as () => void);
    return { unref() {} } as ReturnType<typeof setTimeout>;
  }) as unknown) as typeof setTimeout;

  try {
    const orchestrator = createClusterMasterOrchestrator({
      clusterModule,
      logger,
      workerExec: "dist-local/server/index-local.js",
      config: {
        scaleIntervalMs: 5_000,
        lowLoadHoldMs: 0,
        activeRequestsThreshold: 80,
        lowReqRateThreshold: 8,
        lowMemoryMode: false,
        preallocateMb: 0,
        maxSpawnPerCycle: 1,
        maxWorkers: 2,
        minWorkers: 1,
        initialWorkers: 0,
        scaleCooldownMs: 0,
        restartThrottleMs: 2_000,
        maxRestartAttempts: 5,
        restartFailureWindowMs: 60_000,
        restartBlockMs: 60_000,
      },
    });

    orchestrator.bootCluster();
    intervalHandler?.();
    assert.ok(timeoutHandlers.length >= 1);
    timeoutHandlers[0]?.();

    assert.equal(
      logger.warnCalls.some((entry) =>
        entry.message === "Failed to force-kill draining cluster worker after graceful-shutdown timeout" &&
        entry.metadata?.reason === "scale-down-low-load"),
      true,
    );
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    globalThis.setTimeout = originalSetTimeout;
  }
});
