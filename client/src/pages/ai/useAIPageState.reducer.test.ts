import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_PAGE_INITIAL_STATE,
  aiPageStateReducer,
  type AIPageLocalState,
} from "./useAIPageState";

function withState(overrides: Partial<AIPageLocalState> = {}): AIPageLocalState {
  return {
    ...AI_PAGE_INITIAL_STATE,
    ...overrides,
  };
}

test("AI page reducer applies every page-local state action", () => {
  let state = withState();

  state = aiPageStateReducer(state, { type: "SET_QUERY", value: "semak rekod" });
  state = aiPageStateReducer(state, { type: "SET_AI_STATUS", value: "SEARCHING" });
  state = aiPageStateReducer(state, { type: "SET_GATE_NOTICE", value: "Queued" });
  state = aiPageStateReducer(state, { type: "SET_SLOW_NOTICE", value: true });
  state = aiPageStateReducer(state, { type: "SET_STREAMING_TEXT", value: "Jawapan" });
  state = aiPageStateReducer(state, { type: "SET_STREAMING_TIMESTAMP", value: "2026-06-03T00:00:00.000Z" });
  state = aiPageStateReducer(state, { type: "SET_IS_PROCESSING", value: true });
  state = aiPageStateReducer(state, { type: "SET_IS_TYPING", value: true });

  assert.deepEqual(state, {
    aiStatus: "SEARCHING",
    gateNotice: "Queued",
    isProcessing: true,
    isTyping: true,
    query: "semak rekod",
    slowNotice: true,
    streamingText: "Jawapan",
    streamingTimestamp: "2026-06-03T00:00:00.000Z",
  });
});

test("AI page reducer preserves React functional setter semantics", () => {
  const state = withState({
    gateNotice: "old",
    query: "abc",
    slowNotice: false,
  });

  const nextQuery = aiPageStateReducer(state, {
    type: "SET_QUERY",
    value: (previous) => `${previous}123`,
  });
  const nextGate = aiPageStateReducer(nextQuery, {
    type: "SET_GATE_NOTICE",
    value: (previous) => `${previous || "none"}-next`,
  });
  const nextSlowNotice = aiPageStateReducer(nextGate, {
    type: "SET_SLOW_NOTICE",
    value: (previous) => !previous,
  });

  assert.equal(nextSlowNotice.query, "abc123");
  assert.equal(nextSlowNotice.gateNotice, "old-next");
  assert.equal(nextSlowNotice.slowNotice, true);
});
