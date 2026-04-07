import assert from "node:assert/strict";
import test from "node:test";
import { logger } from "../../lib/logger";
import { createBootstrapTaskState, runAiBootstrapTask } from "../ai-bootstrap-utils";

test("runAiBootstrapTask dedupes in-flight bootstrap work", async () => {
  const state = createBootstrapTaskState();
  let calls = 0;
  let releaseTask!: () => void;
  const taskStarted = new Promise<void>((resolve) => {
    releaseTask = resolve;
  });

  const first = runAiBootstrapTask(state, "boom", async () => {
    calls += 1;
    await taskStarted;
  });
  const second = runAiBootstrapTask(state, "boom", async () => {
    calls += 1;
  });

  releaseTask();
  await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.equal(state.ready, true);
  assert.equal(state.initPromise, null);
});

test("runAiBootstrapTask swallows task errors and allows retry", async () => {
  const state = createBootstrapTaskState();
  let calls = 0;
  const originalError = logger.error;
  logger.error = () => {};

  try {
    await runAiBootstrapTask(state, "expected test failure", async () => {
      calls += 1;
      throw new Error("fail once");
    });

    await runAiBootstrapTask(state, "expected test failure", async () => {
      calls += 1;
    });

    assert.equal(calls, 2);
    assert.equal(state.ready, true);
  } finally {
    logger.error = originalError;
  }
});
