import assert from "node:assert/strict";
import test from "node:test";

import { shutdownClusterMasterDueToFatalError } from "../../internal/cluster-master-shutdown";

const EXPECTED_FATAL_SHUTDOWN_TIMEOUT_CALLBACKS = 2;

test("shutdownClusterMasterDueToFatalError logs worker notification failures", () => {
  const loggerCalls: Array<{ message: string; metadata?: Record<string, unknown> | undefined }> = [];
  const logger = {
    error(message: string, metadata?: Record<string, unknown>) {
      loggerCalls.push({ message, metadata });
    },
  };
  const worker = {
    id: 7,
    process: { pid: 7007 },
    isConnected: () => true,
    isDead: () => false,
    send: () => {
      throw new Error("ipc failed");
    },
  };

  const originalExit = process.exit;
  const originalExitCode = process.exitCode;
  const originalSetTimeout = globalThis.setTimeout;
  const timeoutCallbacks: Array<() => void> = [];
  process.exit = (((_code?: string | number | null | undefined) => undefined) as unknown) as typeof process.exit;
  globalThis.setTimeout = (((handler: TimerHandler) => {
    timeoutCallbacks.push(handler as () => void);
    return { unref() {} } as ReturnType<typeof setTimeout>;
  }) as unknown) as typeof setTimeout;

  try {
    shutdownClusterMasterDueToFatalError({
      reason: "fatal-test",
      clusterModule: {
        isPrimary: false,
        disconnect() {
          throw new Error("disconnect should not run");
        },
      },
      workers: [worker as never],
      logger,
      createGracefulShutdownMessage: (reason) => ({ type: "graceful-shutdown", reason }),
    });

    assert.equal(timeoutCallbacks.length, EXPECTED_FATAL_SHUTDOWN_TIMEOUT_CALLBACKS);
    const loggedWorkerNotificationFailure = loggerCalls.some(
      (entry) =>
        entry.message === "Failed to notify cluster worker about fatal master shutdown" &&
        entry.metadata?.reason === "fatal-test" &&
        entry.metadata?.workerId === 7,
    );
    assert.equal(loggedWorkerNotificationFailure, true);
  } finally {
    process.exit = originalExit;
    process.exitCode = originalExitCode;
    globalThis.setTimeout = originalSetTimeout;
  }
});
