import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  registerClusterMasterLifecycle,
  wireClusterMasterWorker,
} from "../cluster-master-lifecycle";
import type { WorkerMetricsPayload } from "../worker-ipc";

class FakeWorker extends EventEmitter {
  readonly sentMessages: unknown[] = [];

  constructor(
    readonly id: number,
    readonly process = { pid: 1_000 + id },
  ) {
    super();
  }

  isConnected() {
    return true;
  }

  isDead() {
    return false;
  }

  send(message: unknown) {
    this.sentMessages.push(message);
  }
}

function createMutableState() {
  return {
    workerMetrics: new Map<number, WorkerMetricsPayload>(),
    workerFatalReasons: new Map<number, string>(),
    wiredWorkers: new Set<number>(),
    intentionalExits: new Set<number>(),
    drainingWorkers: new Set<number>(),
    lastSpawnAttemptTime: 0,
    lastBroadcast: null,
    unexpectedExitTimestamps: [],
    restartBlockedUntil: 0,
    lastRestartBlockLogAt: 0,
    fatalStartupLockReason: null,
    sessionRevocations: new Map(),
  };
}

test("wireClusterMasterWorker rebroadcasts session revocations from one worker to the others", () => {
  const firstWorker = new FakeWorker(1);
  const secondWorker = new FakeWorker(2);
  const state = createMutableState();

  wireClusterMasterWorker({
    worker: firstWorker as never,
    logger: {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    },
    restartBlockMs: 60_000,
    state,
    controls: {
      getWorkers: () => [firstWorker as never, secondWorker as never],
      rollingRestartOne: async () => undefined,
    },
  });

  firstWorker.emit("message", {
    type: "worker-session-revoked",
    payload: {
      activityId: "activity-shared",
      expiresAt: 123_456,
    },
  });

  assert.deepEqual(firstWorker.sentMessages, []);
  assert.deepEqual(secondWorker.sentMessages, [{
    type: "session-revoked",
    payload: {
      activityId: "activity-shared",
      expiresAt: 123_456,
    },
  }]);
});

test("registerClusterMasterLifecycle syncs still-active session revocations to newly online workers", () => {
  const clusterModule = new EventEmitter();
  const worker = new FakeWorker(3);
  const state = createMutableState();
  state.sessionRevocations.set("activity-existing", {
    activityId: "activity-existing",
    expiresAt: Date.now() + 60_000,
  });

  registerClusterMasterLifecycle({
    clusterModule: clusterModule as never,
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
    logger: {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    },
    state,
    controls: {
      getWorkers: () => [worker as never],
      rollingRestartOne: async () => undefined,
      safeFork: () => null,
      shutdownMasterDueToFatalError: () => undefined,
    },
  });

  clusterModule.emit("online", worker as never);

  assert.deepEqual(worker.sentMessages, [{
    type: "session-revoked",
    payload: {
      activityId: "activity-existing",
      expiresAt: state.sessionRevocations.get("activity-existing")?.expiresAt,
    },
  }]);
});
