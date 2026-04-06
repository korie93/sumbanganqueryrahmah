import assert from "node:assert/strict";
import test from "node:test";
import { logger } from "../../lib/logger";
import type {
  SettingsBootstrapSqlExecutor,
  SettingsBootstrapTaskState,
} from "../settings-bootstrap-shared";
import { runSettingsBootstrapTask } from "../settings-bootstrap-utils";

function createExecutor(executions: unknown[]): SettingsBootstrapSqlExecutor {
  return {
    execute: ((query) => {
      executions.push(query);
      return {} as any;
    }) as SettingsBootstrapSqlExecutor["execute"],
  };
}

test("settings bootstrap task runner shares in-flight work and marks state ready", async () => {
  const executions: unknown[] = [];
  const state: SettingsBootstrapTaskState = {
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

  const first = runSettingsBootstrapTask(state, task, {
    database: executor,
    errorMessage: "settings bootstrap failed",
  });
  await taskStarted;
  const second = runSettingsBootstrapTask(state, task, {
    database: executor,
    errorMessage: "settings bootstrap failed",
  });

  assert.ok(state.initPromise);
  releaseTask();
  await Promise.all([first, second]);

  assert.equal(taskCalls, 1);
  assert.equal(executions.length, 1);
  assert.equal(state.ready, true);
  assert.equal(state.initPromise, null);
});

test("settings bootstrap task runner swallows failures without marking state ready", async () => {
  const executions: unknown[] = [];
  const state: SettingsBootstrapTaskState = {
    ready: false,
    initPromise: null,
  };
  const originalLoggerError = logger.error;
  logger.error = () => {};

  try {
    await runSettingsBootstrapTask(
      state,
      async () => {
        throw new Error("boom");
      },
      {
        database: createExecutor(executions),
        errorMessage: "settings bootstrap failed",
      },
    );
  } finally {
    logger.error = originalLoggerError;
  }

  assert.equal(executions.length, 1);
  assert.equal(state.ready, false);
  assert.equal(state.initPromise, null);
});
