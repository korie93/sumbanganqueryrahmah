import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Worker } from "node:cluster";
import test, { type TestContext } from "node:test";
import { createClusterMasterOrchestrator } from "../cluster-master-orchestrator";
import type {
  ClusterMasterLogger,
  ClusterMasterOrchestratorConfig,
} from "../cluster-master-types";

type FakeTimerHandle = {
  delayMs: number;
  label: string;
  unrefCalled: boolean;
  unref: () => FakeTimerHandle;
};

type FakeClusterWorker = Worker & {
  sentMessages: unknown[];
  killCalls: number;
  emitMessage: (message: unknown) => void;
};

function createFakeTimerHandle(label: string, delayMs: number): FakeTimerHandle {
  const handle: FakeTimerHandle = {
    delayMs,
    label,
    unrefCalled: false,
    unref() {
      this.unrefCalled = true;
      return this;
    },
  };
  return handle;
}

function installTimerMocks(t: TestContext) {
  const intervalHandle = createFakeTimerHandle("scale-interval", 0);
  const timeoutHandles: FakeTimerHandle[] = [];
  const clearedIntervals: FakeTimerHandle[] = [];
  const clearedTimeouts: FakeTimerHandle[] = [];

  t.mock.method(
    globalThis,
    "setInterval",
    (((_handler: () => void, delayMs?: number) => {
      intervalHandle.delayMs = Number(delayMs ?? 0);
      return intervalHandle as unknown as ReturnType<typeof setInterval>;
    }) as unknown) as typeof setInterval,
  );
  t.mock.method(
    globalThis,
    "clearInterval",
    (((handle?: ReturnType<typeof setInterval>) => {
      clearedIntervals.push(handle as unknown as FakeTimerHandle);
    }) as unknown) as typeof clearInterval,
  );
  t.mock.method(
    globalThis,
    "setTimeout",
    (((_handler: () => void, delayMs?: number) => {
      const handle = createFakeTimerHandle(`timeout-${timeoutHandles.length + 1}`, Number(delayMs ?? 0));
      timeoutHandles.push(handle);
      return handle as unknown as ReturnType<typeof setTimeout>;
    }) as unknown) as typeof setTimeout,
  );
  t.mock.method(
    globalThis,
    "clearTimeout",
    (((handle?: ReturnType<typeof setTimeout>) => {
      clearedTimeouts.push(handle as unknown as FakeTimerHandle);
    }) as unknown) as typeof clearTimeout,
  );

  return {
    clearedIntervals,
    clearedTimeouts,
    intervalHandle,
    timeoutHandles,
  };
}

function createFakeWorker(id: number): FakeClusterWorker {
  const emitter = new EventEmitter();
  const worker = Object.assign(emitter, {
    id,
    killCalls: 0,
    process: { pid: 10_000 + id },
    sentMessages: [] as unknown[],
    emitMessage(message: unknown) {
      emitter.emit("message", message);
    },
    isConnected() {
      return true;
    },
    isDead() {
      return false;
    },
    kill() {
      this.killCalls += 1;
    },
    send(message: unknown) {
      this.sentMessages.push(message);
      return true;
    },
  });

  return worker as FakeClusterWorker;
}

function createFakeClusterModule() {
  const emitter = new EventEmitter();
  const workers: Record<number, FakeClusterWorker> = {};
  let nextWorkerId = 1;

  return {
    disconnectCalls: 0,
    isPrimary: true,
    workers,
    disconnect(callback?: () => void) {
      this.disconnectCalls += 1;
      callback?.();
    },
    fork() {
      const worker = createFakeWorker(nextWorkerId);
      nextWorkerId += 1;
      workers[worker.id] = worker;
      return worker;
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      emitter.on(event, listener);
      return this;
    },
    setupPrimary() {
      return undefined;
    },
  };
}

function createTestLogger(): ClusterMasterLogger {
  return {
    error: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  };
}

function createTestConfig(): ClusterMasterOrchestratorConfig {
  return {
    activeRequestsThreshold: 80,
    gracefulShutdownTimeoutMs: 5_000,
    initialWorkers: 2,
    lowLoadHoldMs: 60_000,
    lowMemoryMode: false,
    lowReqRateThreshold: 8,
    maxRestartAttempts: 5,
    maxSpawnPerCycle: 1,
    maxWorkers: 2,
    minWorkers: 1,
    preallocateMb: 0,
    restartBlockMs: 60_000,
    restartFailureWindowMs: 60_000,
    restartThrottleMs: 2_000,
    scaleCooldownMs: 15_000,
    scaleIntervalMs: 5_000,
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

test("cluster master dispose cancels rolling restart timers", async (t) => {
  const timers = installTimerMocks(t);
  const fakeCluster = createFakeClusterModule();
  const orchestrator = createClusterMasterOrchestrator({
    clusterModule: fakeCluster as unknown as Parameters<typeof createClusterMasterOrchestrator>[0]["clusterModule"],
    config: createTestConfig(),
    logger: createTestLogger(),
    workerExec: "fake-worker.js",
  });

  orchestrator.bootCluster();
  const firstWorker = fakeCluster.workers[1];
  assert.ok(firstWorker);
  assert.equal(timers.intervalHandle.unrefCalled, true);

  firstWorker.emitMessage({
    type: "worker-event",
    payload: { kind: "memory-pressure" },
  });
  await flushAsyncWork();

  assert.deepEqual(
    timers.timeoutHandles.map((handle) => handle.delayMs).sort((a, b) => a - b),
    [10_000, 30_000],
  );
  assert.equal(timers.timeoutHandles.every((handle) => handle.unrefCalled), true);
  assert.equal(firstWorker.sentMessages.length, 1);

  orchestrator.dispose();

  assert.deepEqual(timers.clearedIntervals, [timers.intervalHandle]);
  assert.deepEqual(
    timers.clearedTimeouts.map((handle) => handle.delayMs).sort((a, b) => a - b),
    [10_000, 30_000],
  );
});
