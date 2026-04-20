import type { CircuitState } from "./circuitBreaker";
export type { SessionRevocationReplicationPayload } from "../auth/session-revocation-registry";
import type { SessionRevocationReplicationPayload } from "../auth/session-revocation-registry";

export type WorkerControlState = {
  mode: "NORMAL" | "DEGRADED" | "PROTECTION";
  healthScore: number;
  dbProtection: boolean;
  rejectHeavyRoutes: boolean;
  throttleFactor: number;
  predictor: {
    requestRateMA: number;
    latencyMA: number;
    cpuMA: number;
    requestRateTrend: number;
    latencyTrend: number;
    cpuTrend: number;
    sustainedUpward: boolean;
    lastUpdatedAt: number | null;
  };
  workerCount: number;
  maxWorkers: number;
  queueLength: number;
  preAllocateMB: number;
  updatedAt: number;
  workers: Array<{
    workerId: number;
    pid: number;
    cpuPercent: number;
    reqRate: number;
    latencyP95Ms: number;
    eventLoopLagMs: number;
    activeRequests: number;
    heapUsedMB: number;
    oldSpaceMB: number;
    dbLatencyMs: number;
    aiLatencyMs: number;
    ts: number;
  }>;
  circuits: {
    aiOpenWorkers: number;
    dbOpenWorkers: number;
    exportOpenWorkers: number;
  };
};

export type WorkerCircuitMetric = {
  state: CircuitState;
  failureRate: number;
};

export type WorkerMetricsPayload = {
  workerId: number;
  pid: number;
  cpuPercent: number;
  reqRate: number;
  latencyP95Ms: number;
  eventLoopLagMs: number;
  activeRequests: number;
  queueLength: number;
  heapUsedMB: number;
  heapTotalMB: number;
  oldSpaceMB: number;
  gcPerMin: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  ts: number;
  circuit: {
    ai: WorkerCircuitMetric;
    db: WorkerCircuitMetric;
    export: WorkerCircuitMetric;
  };
};

export type WorkerMetricsMessage = {
  type: "worker-metrics";
  payload: WorkerMetricsPayload;
};

export type WorkerEventMessage = {
  type: "worker-event";
  payload: {
    kind: "memory-pressure";
  };
};

export type WorkerFatalMessage = {
  type: "worker-fatal";
  payload: {
    reason: string;
    details: string;
  };
};

export type WorkerSessionRevokedMessage = {
  type: "worker-session-revoked";
  payload: SessionRevocationReplicationPayload;
};

export type WorkerToMasterMessage =
  | WorkerMetricsMessage
  | WorkerEventMessage
  | WorkerFatalMessage
  | WorkerSessionRevokedMessage;

export type ControlStateMessage = {
  type: "control-state";
  payload: Partial<WorkerControlState>;
};

export type GracefulShutdownMessage = {
  type: "graceful-shutdown";
  reason?: string;
};

export type SessionRevokedMessage = {
  type: "session-revoked";
  payload: SessionRevocationReplicationPayload;
};

export type MasterToWorkerMessage =
  | ControlStateMessage
  | GracefulShutdownMessage
  | SessionRevokedMessage;

function isMessageRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function isControlStateMessage(message: unknown): message is ControlStateMessage {
  return isMessageRecord(message)
    && message.type === "control-state"
    && isMessageRecord(message.payload);
}

export function isGracefulShutdownMessage(message: unknown): message is GracefulShutdownMessage {
  return isMessageRecord(message) && message.type === "graceful-shutdown";
}

export function isWorkerFatalMessage(message: unknown): message is WorkerFatalMessage {
  return isMessageRecord(message)
    && message.type === "worker-fatal"
    && isMessageRecord(message.payload)
    && typeof message.payload.reason === "string";
}

export function isWorkerMetricsMessage(message: unknown): message is WorkerMetricsMessage {
  return isMessageRecord(message)
    && message.type === "worker-metrics"
    && isMessageRecord(message.payload);
}

export function isWorkerSessionRevokedMessage(message: unknown): message is WorkerSessionRevokedMessage {
  return isMessageRecord(message)
    && message.type === "worker-session-revoked"
    && isMessageRecord(message.payload)
    && typeof message.payload.activityId === "string"
    && Number.isFinite(message.payload.expiresAt);
}

export function isWorkerMemoryPressureMessage(message: unknown): message is WorkerEventMessage {
  return isMessageRecord(message)
    && message.type === "worker-event"
    && isMessageRecord(message.payload)
    && message.payload.kind === "memory-pressure";
}

export function isSessionRevokedMessage(message: unknown): message is SessionRevokedMessage {
  return isMessageRecord(message)
    && message.type === "session-revoked"
    && isMessageRecord(message.payload)
    && typeof message.payload.activityId === "string"
    && Number.isFinite(message.payload.expiresAt);
}
