import {
  isWorkerFatalMessage,
  isWorkerMemoryPressureMessage,
  isWorkerMetricsMessage,
  isWorkerReadyMessage,
  type WorkerMetricsPayload,
} from "./worker-ipc";

export type ClusterWorkerMessageOutcome =
  | { kind: "fatal"; reason: string; shouldLockAutomaticRestart: boolean }
  | { kind: "metrics"; payload: WorkerMetricsPayload }
  | { kind: "memory-pressure" }
  | { kind: "ready"; pid: number; readyAt: number }
  | { kind: "ignored" };

export function parseClusterWorkerMessage(message: unknown): ClusterWorkerMessageOutcome {
  if (isWorkerFatalMessage(message)) {
    const reason = message.payload.reason || "UNKNOWN_FATAL";
    return {
      kind: "fatal",
      reason,
      shouldLockAutomaticRestart: reason === "EADDRINUSE",
    };
  }

  if (isWorkerMetricsMessage(message)) {
    return {
      kind: "metrics",
      payload: message.payload,
    };
  }

  if (isWorkerMemoryPressureMessage(message)) {
    return { kind: "memory-pressure" };
  }

  if (isWorkerReadyMessage(message)) {
    return {
      kind: "ready",
      pid: message.payload.pid,
      readyAt: message.payload.readyAt,
    };
  }

  return { kind: "ignored" };
}
