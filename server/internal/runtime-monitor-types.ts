import type { Pool } from "pg";
import type { CircuitSnapshot } from "./circuitBreaker";
import type {
  EvaluateSystemResult,
  SystemHistory,
  SystemSnapshot,
} from "../intelligence/types";
import type { WorkerControlState, WorkerToMasterMessage } from "./worker-ipc";

export type InternalMonitorSnapshot = {
  score: number;
  mode: "NORMAL" | "DEGRADED" | "PROTECTION";
  cpuPercent: number;
  ramPercent: number;
  p95LatencyMs: number;
  errorRate: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  eventLoopLagMs: number;
  requestRate: number;
  activeRequests: number;
  queueLength: number;
  workerCount: number;
  maxWorkers: number;
  dbProtection: boolean;
  slowQueryCount: number;
  dbConnections: number;
  aiFailRate: number;
  status401Count: number;
  status403Count: number;
  status429Count: number;
  localOpenCircuitCount: number;
  clusterOpenCircuitCount: number;
  bottleneckType: string;
  updatedAt: number;
};

export type InternalMonitorAlert = {
  id: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  timestamp: string;
  source: string;
};

export type LocalCircuitSnapshots = {
  ai: CircuitSnapshot;
  db: CircuitSnapshot;
  export: CircuitSnapshot;
};

export type PoolWithOptions = Pool & {
  options?: {
    max?: number;
  };
};

export type IpcCapableProcess = NodeJS.Process & {
  send?: (message: WorkerToMasterMessage) => void;
};

export type GcCapableGlobal = typeof globalThis & {
  gc?: () => void;
};

export type RuntimeMonitorManagerOptions = {
  pool: Pool;
  apiDebugLogs: boolean;
  lowMemoryMode: boolean;
  pgPoolWarnCooldownMs: number;
  aiLatencyStaleAfterMs: number;
  aiLatencyDecayHalfLifeMs: number;
  getSearchQueueLength: () => number;
  evaluateSystem: (snapshot: SystemSnapshot, history: SystemHistory) => Promise<EvaluateSystemResult>;
};

export type AttachProcessHandlersOptions = {
  onGracefulShutdown: () => void;
};

export type StartRuntimeLoopsOptions = {
  clearSearchCache: () => void;
};
