import assert from "node:assert/strict";
import test from "node:test";
import { createClusterMasterFatalHandlers } from "../../internal/cluster-master-fatal-handlers";

function createLogger(options: { throwOnError?: boolean } = {}) {
  return {
    errorCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    error(message: string, metadata?: Record<string, unknown>) {
      if (options.throwOnError) {
        throw new Error("logger failed");
      }
      this.errorCalls.push({ message, metadata });
    },
  };
}

test("cluster master fatal handlers delegate normal fatal events to the orchestrator", () => {
  const calls: Array<{ event: string; value: unknown }> = [];
  const logger = createLogger();
  const handlers = createClusterMasterFatalHandlers({
    clusterMaster: {
      handleUncaughtException(error) {
        calls.push({ event: "uncaughtException", value: error });
      },
      handleUnhandledRejection(reason) {
        calls.push({ event: "unhandledRejection", value: reason });
      },
    },
    logger,
  });
  const error = new Error("boom");
  const rejection = { code: "timeout" };

  handlers.handleUncaughtException(error);
  handlers.handleUnhandledRejection(rejection);

  assert.deepEqual(calls, [
    { event: "uncaughtException", value: error },
    { event: "unhandledRejection", value: rejection },
  ]);
  assert.equal(logger.errorCalls.length, 0);
});

test("cluster master fatal handlers force exit if the uncaught exception handler throws", () => {
  const logger = createLogger();
  const stderrWrites: string[] = [];
  const exitCodes: number[] = [];
  const handlers = createClusterMasterFatalHandlers({
    clusterMaster: {
      handleUncaughtException() {
        throw new Error("shutdown failed");
      },
      handleUnhandledRejection() {
        return undefined;
      },
    },
    exit(code) {
      exitCodes.push(code);
    },
    logger,
    stderr: {
      write(message) {
        stderrWrites.push(message);
      },
    },
  });

  handlers.handleUncaughtException(new Error("boom"));

  assert.deepEqual(exitCodes, [1]);
  assert.match(stderrWrites[0] ?? "", /shutdown failed/);
  assert.deepEqual(logger.errorCalls, [{
    message: "Cluster master fatal handler failed; forcing process exit",
    metadata: {
      event: "uncaughtException",
      error: { name: "Error" },
    },
  }]);
});

test("cluster master fatal handlers still exit if structured logging and stderr fail", () => {
  const exitCodes: number[] = [];
  const handlers = createClusterMasterFatalHandlers({
    clusterMaster: {
      handleUncaughtException() {
        return undefined;
      },
      handleUnhandledRejection() {
        throw new Error("rejection cleanup failed");
      },
    },
    exit(code) {
      exitCodes.push(code);
    },
    logger: createLogger({ throwOnError: true }),
    stderr: {
      write() {
        throw new Error("stderr failed");
      },
    },
  });

  assert.doesNotThrow(() => {
    handlers.handleUnhandledRejection(new Error("boom"));
  });
  assert.deepEqual(exitCodes, [1]);
});
