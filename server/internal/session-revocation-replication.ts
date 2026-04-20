import {
  applyReplicatedSessionRevocation,
  configureSessionRevocationReplication,
  type SessionRevocationReplicationPayload,
} from "../auth/session-revocation-registry";
import { sendWorkerMessage } from "./runtime-monitor-metrics";
import { isSessionRevokedMessage } from "./worker-ipc";

type WorkerIpcProcess = NodeJS.Process & {
  off?: (event: "message", listener: (message: unknown) => void) => NodeJS.Process;
};

const workerIpcProcess = process as WorkerIpcProcess;

export function bindWorkerSessionRevocationReplication() {
  if (typeof workerIpcProcess.send !== "function") {
    configureSessionRevocationReplication(null);
    return () => {
      configureSessionRevocationReplication(null);
    };
  }

  const handleReplicatedSessionRevocation = (message: unknown) => {
    if (!isSessionRevokedMessage(message)) {
      return;
    }

    applyReplicatedSessionRevocation(message.payload);
  };

  configureSessionRevocationReplication({
    publishRevocation(payload: SessionRevocationReplicationPayload) {
      sendWorkerMessage(workerIpcProcess, {
        type: "worker-session-revoked",
        payload,
      });
    },
  });

  workerIpcProcess.on("message", handleReplicatedSessionRevocation);

  return () => {
    configureSessionRevocationReplication(null);
    workerIpcProcess.off?.("message", handleReplicatedSessionRevocation);
  };
}
