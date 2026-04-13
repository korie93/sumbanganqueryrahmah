import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkerProcessFatalHandlers,
  registerWorkerProcessFatalHandlers,
} from "../../internal/worker-process-fatal-handlers";

function createLogger() {
  return {
    errorCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    error(message: string, metadata?: Record<string, unknown>) {
      this.errorCalls.push({ message, metadata });
    },
  };
}

test("worker fatal handlers notify master and request shutdown for uncaught exceptions", () => {
  const logger = createLogger();
  const masterFatalCalls: Array<{ reason: string; details: string | undefined }> = [];
  const shutdownCalls: Array<{ reason: string; details: string; exitCode: number }> = [];

  const handlers = createWorkerProcessFatalHandlers({
    logger,
    notifyMasterFatal: (reason, details) => {
      masterFatalCalls.push({ reason, details });
    },
    shutdown: (params) => {
      shutdownCalls.push(params);
    },
  });

  const error = new Error("worker exploded");
  handlers.handleUncaughtException(error);

  assert.deepEqual(masterFatalCalls, [{
    reason: "WORKER_UNCAUGHT_EXCEPTION",
    details: error.stack ?? error.message,
  }]);
  assert.deepEqual(shutdownCalls, [{
    reason: "uncaughtException",
    details: error.stack ?? error.message,
    exitCode: 1,
  }]);
  assert.equal(logger.errorCalls[0]?.message, "Uncaught exception in worker process");
});

test("worker fatal handlers notify master and request shutdown for unhandled rejections", () => {
  const logger = createLogger();
  const masterFatalCalls: Array<{ reason: string; details: string | undefined }> = [];
  const shutdownCalls: Array<{ reason: string; details: string; exitCode: number }> = [];

  const handlers = createWorkerProcessFatalHandlers({
    logger,
    notifyMasterFatal: (reason, details) => {
      masterFatalCalls.push({ reason, details });
    },
    shutdown: (params) => {
      shutdownCalls.push(params);
    },
  });

  handlers.handleUnhandledRejection({ kind: "timeout", retriable: false });

  assert.equal(masterFatalCalls[0]?.reason, "WORKER_UNHANDLED_REJECTION");
  assert.match(masterFatalCalls[0]?.details ?? "", /kind: 'timeout'/);
  assert.deepEqual(shutdownCalls, [{
    reason: "unhandledRejection",
    details: masterFatalCalls[0]?.details ?? "",
    exitCode: 1,
  }]);
  assert.equal(logger.errorCalls[0]?.message, "Unhandled rejection in worker process");
});

test("worker fatal handler registration wires and unwires process listeners safely", () => {
  const processHandlers = new Map<string, Function[]>();
  const processRef = {
    on(event: string, handler: Function) {
      const handlers = processHandlers.get(event) ?? [];
      handlers.push(handler);
      processHandlers.set(event, handlers);
      return processRef;
    },
    off(event: string, handler: Function) {
      const handlers = processHandlers.get(event) ?? [];
      processHandlers.set(event, handlers.filter((candidate) => candidate !== handler));
      return processRef;
    },
  };

  const dispose = registerWorkerProcessFatalHandlers({
    processRef,
    logger: createLogger(),
    notifyMasterFatal: () => undefined,
    shutdown: () => undefined,
  });

  assert.equal(processHandlers.get("uncaughtException")?.length, 1);
  assert.equal(processHandlers.get("unhandledRejection")?.length, 1);

  dispose();

  assert.equal(processHandlers.get("uncaughtException")?.length, 0);
  assert.equal(processHandlers.get("unhandledRejection")?.length, 0);
});
