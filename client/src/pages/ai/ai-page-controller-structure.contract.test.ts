import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readAiSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("AI page controller remains a thin orchestrator over focused hooks", () => {
  const controllerSource = readAiSource("useAIPageController.ts");
  const lines = controllerSource.split(/\r?\n/).filter((line) => line.trim()).length;

  assert.ok(lines < 100, `expected controller under 100 non-empty lines, got ${lines}`);
  assert.match(controllerSource, /useAIPageState\(\)/);
  assert.match(controllerSource, /useAIPageActions\(/);
  assert.match(controllerSource, /useAIPageLifecycleEffects\(/);
  assert.doesNotMatch(controllerSource, /searchAI\(/);
  assert.doesNotMatch(controllerSource, /window\.addEventListener/);
});

test("AI page lifecycle event listeners are abortable on unmount", () => {
  const lifecycleSource = readAiSource("useAIPageLifecycleEffects.ts");

  assert.match(lifecycleSource, /new AbortController\(\)/);
  assert.match(lifecycleSource, /addEventListener\(AI_RESET_EVENT, onReset, \{ signal: controller\.signal \}\)/);
  assert.match(lifecycleSource, /addEventListener\(AI_CANCEL_EVENT, onCancel, \{ signal: controller\.signal \}\)/);
  assert.match(lifecycleSource, /controller\.abort\(\)/);
});

test("AI page local state is centralized in a reducer", () => {
  const stateSource = readAiSource("useAIPageState.ts");

  assert.match(stateSource, /useReducer\(aiPageStateReducer, AI_PAGE_INITIAL_STATE\)/);
  assert.match(stateSource, /export function aiPageStateReducer/);
  assert.doesNotMatch(stateSource, /useState\(/);
});

test("AI page actions route response parsing through bounded readers", () => {
  const actionsSource = readAiSource("useAIPageActions.ts");

  assert.match(actionsSource, /readAIChatErrorResponse/);
  assert.match(actionsSource, /readAIChatSuccessPayload/);
  assert.doesNotMatch(actionsSource, /\.json\(/);
});
