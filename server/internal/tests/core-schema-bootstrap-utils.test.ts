import assert from "node:assert/strict";
import test from "node:test";
import { logger } from "../../lib/logger";
import {
  runCoreSchemaBootstrapTask,
  type CoreSchemaBootstrapTaskState,
  type CoreSchemaSqlExecutor,
} from "../core-schema-bootstrap-utils";

type CoreSchemaSqlQuery = Parameters<CoreSchemaSqlExecutor["execute"]>[0];
type CoreSchemaSqlResult = ReturnType<CoreSchemaSqlExecutor["execute"]>;

function createExecutor(executions: CoreSchemaSqlQuery[]): CoreSchemaSqlExecutor {
  return {
    execute: ((query) => {
      executions.push(query);
      return {} as unknown as CoreSchemaSqlResult;
    }) as CoreSchemaSqlExecutor["execute"],
  };
}

test("core schema bootstrap task runner shares in-flight work and marks state ready", async () => {
  const executions: CoreSchemaSqlQuery[] = [];
  const state: CoreSchemaBootstrapTaskState = {
    ready: false,
    initPromise: null,
  };
  let taskCalls = 0;
  let releaseTask!: () => void;
  let markTaskStarted!: () => void;
  const taskStarted = new Promise<void>((resolve) => {
    markTaskStarted = resolve;
  });
  const executor = createExecutor(executions);

  const task = async () => {
    taskCalls += 1;
    await new Promise<void>((resolve) => {
      releaseTask = resolve;
      markTaskStarted();
    });
  };

  const first = runCoreSchemaBootstrapTask(state, task, {
    errorMessage: "bootstrap failed",
    database: executor,
  });
  await taskStarted;
  const second = runCoreSchemaBootstrapTask(state, task, {
    errorMessage: "bootstrap failed",
    database: executor,
  });

  assert.ok(state.initPromise);
  releaseTask();

  await Promise.all([first, second]);

  assert.equal(taskCalls, 1);
  assert.equal(executions.length, 1);
  assert.equal(state.ready, true);
  assert.equal(state.initPromise, null);
});

test("core schema bootstrap task runner can swallow failures without marking state ready", async () => {
  const executions: CoreSchemaSqlQuery[] = [];
  const state: CoreSchemaBootstrapTaskState = {
    ready: false,
    initPromise: null,
  };
  const originalLoggerError = logger.error;
  logger.error = () => {};

  try {
    await runCoreSchemaBootstrapTask(
      state,
      async () => {
        throw new Error("boom");
      },
      {
        errorMessage: "bootstrap failed",
        database: createExecutor(executions),
        rethrowError: false,
      },
    );
  } finally {
    logger.error = originalLoggerError;
  }

  assert.equal(executions.length, 1);
  assert.equal(state.ready, false);
  assert.equal(state.initPromise, null);
});
