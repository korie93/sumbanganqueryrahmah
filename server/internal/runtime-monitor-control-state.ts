import type { WorkerControlState } from "./worker-ipc";
import { clamp } from "./runtime-monitor-metrics";

export function createDefaultWorkerControlState(): WorkerControlState {
  return {
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
    maxWorkers: 1,
    queueLength: 0,
    preAllocateMB: 0,
    updatedAt: Date.now(),
    workers: [],
    circuits: {
      aiOpenWorkers: 0,
      dbOpenWorkers: 0,
      exportOpenWorkers: 0,
    },
  };
}

type CreateRuntimeControlStateManagerOptions = {
  lowMemoryMode: boolean;
  getLastDbLatencyMs: () => number;
};

export function createRuntimeControlStateManager({
  lowMemoryMode,
  getLastDbLatencyMs,
}: CreateRuntimeControlStateManagerOptions) {
  const defaultControlState = createDefaultWorkerControlState();
  let controlState: WorkerControlState = defaultControlState;
  let preAllocatedBuffer: Buffer | null = null;

  function getControlState() {
    return controlState;
  }

  function applyControlState(payload: Partial<WorkerControlState>) {
    controlState = {
      ...defaultControlState,
      ...payload,
    };

    const preAllocateMB = clamp(controlState.preAllocateMB, 0, lowMemoryMode ? 8 : 32);
    if (preAllocateMB > 0) {
      const targetBytes = preAllocateMB * 1024 * 1024;
      if (!preAllocatedBuffer || preAllocatedBuffer.length !== targetBytes) {
        preAllocatedBuffer = Buffer.alloc(targetBytes);
      }
    } else {
      preAllocatedBuffer = null;
    }
  }

  function getDbProtection() {
    return controlState.dbProtection || getLastDbLatencyMs() > 1000;
  }

  return {
    getControlState,
    applyControlState,
    getDbProtection,
  };
}
