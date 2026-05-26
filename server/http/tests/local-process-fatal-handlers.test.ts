import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalProcessFatalHandlers,
  registerLocalProcessFatalHandlers,
} from "../../internal/local-process-fatal-handlers";

type TestHandler = (...args: unknown[]) => unknown;

function createLogger() {
  return {
    errorCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    error(message: string, metadata?: Record<string, unknown>) {
      this.errorCalls.push({ message, metadata });
    },
  };
}

test("local process fatal handlers request graceful shutdown for uncaught exceptions", () => {
  const logger = createLogger();
  const fatalCalls: Array<{ reason: string; details: string | undefined }> = [];
  const shutdownCalls: Array<{ reason: string; details: string; exitCode: number }> = [];

  const handlers = createLocalProcessFatalHandlers({
    logger,
    notifyFatal: (reason, details) => {
      fatalCalls.push({ reason, details });
    },
    shutdown: (params) => {
      shutdownCalls.push(params);
    },
  });

  const error = new Error("local server exploded");
  handlers.handleUncaughtException(error);

  assert.deepEqual(fatalCalls, [{
    details: error.stack ?? error.message,
    reason: "PROCESS_UNCAUGHT_EXCEPTION",
  }]);
  assert.deepEqual(shutdownCalls, [{
    details: error.stack ?? error.message,
    exitCode: 1,
    reason: "uncaughtException",
  }]);
  assert.equal(logger.errorCalls[0]?.message, "Uncaught exception in local server process");
});

test("local process fatal handlers request graceful shutdown for unhandled rejections", () => {
  const logger = createLogger();
  const fatalCalls: Array<{ reason: string; details: string | undefined }> = [];
  const shutdownCalls: Array<{ reason: string; details: string; exitCode: number }> = [];

  const handlers = createLocalProcessFatalHandlers({
    logger,
    notifyFatal: (reason, details) => {
      fatalCalls.push({ reason, details });
    },
    shutdown: (params) => {
      shutdownCalls.push(params);
    },
  });

  handlers.handleUnhandledRejection({ kind: "timeout", retriable: false });

  assert.equal(fatalCalls[0]?.reason, "PROCESS_UNHANDLED_REJECTION");
  assert.match(fatalCalls[0]?.details ?? "", /kind: 'timeout'/);
  assert.deepEqual(shutdownCalls, [{
    details: fatalCalls[0]?.details ?? "",
    exitCode: 1,
    reason: "unhandledRejection",
  }]);
  assert.equal(logger.errorCalls[0]?.message, "Unhandled rejection in local server process");
});

test("local process fatal handler registration wires and unwires process listeners safely", () => {
  const processHandlers = new Map<string, TestHandler[]>();
  const processRef = {
    on(event: string, handler: TestHandler) {
      const handlers = processHandlers.get(event) ?? [];
      handlers.push(handler);
      processHandlers.set(event, handlers);
      return processRef;
    },
    off(event: string, handler: TestHandler) {
      const handlers = processHandlers.get(event) ?? [];
      processHandlers.set(event, handlers.filter((candidate) => candidate !== handler));
      return processRef;
    },
  };

  const dispose = registerLocalProcessFatalHandlers({
    logger: createLogger(),
    notifyFatal: () => undefined,
    processRef,
    shutdown: () => undefined,
  });

  assert.equal(processHandlers.get("uncaughtException")?.length, 1);
  assert.equal(processHandlers.get("unhandledRejection")?.length, 1);

  dispose();

  assert.equal(processHandlers.get("uncaughtException")?.length, 0);
  assert.equal(processHandlers.get("unhandledRejection")?.length, 0);
});
