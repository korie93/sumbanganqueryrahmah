import {
  isWorkerFatalMessage,
  isWorkerMemoryPressureMessage,
  isWorkerMetricsMessage,
  isWorkerSessionRevokedMessage,
  type SessionRevocationReplicationPayload,
  type WorkerMetricsPayload,
} from "./worker-ipc";

export type ClusterWorkerMessageOutcome =
  | { kind: "fatal"; reason: string; shouldLockAutomaticRestart: boolean }
  | { kind: "metrics"; payload: WorkerMetricsPayload }
  | { kind: "session-revoked"; payload: SessionRevocationReplicationPayload }
  | { kind: "memory-pressure" }
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

  if (isWorkerSessionRevokedMessage(message)) {
    return {
      kind: "session-revoked",
      payload: message.payload,
    };
  }

  if (isWorkerMemoryPressureMessage(message)) {
    return { kind: "memory-pressure" };
  }

  return { kind: "ignored" };
}
