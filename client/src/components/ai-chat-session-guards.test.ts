import assert from "node:assert/strict";
import test from "node:test";

import {
  canApplyAIChatUiUpdate,
  canRetryAIChatRequest,
  isActiveAIChatSession,
} from "@/components/ai-chat-session-guards";

test("isActiveAIChatSession only accepts the current session id", () => {
  const sessionRef = { current: 4 };

  assert.equal(isActiveAIChatSession(4, sessionRef), true);
  assert.equal(isActiveAIChatSession(3, sessionRef), false);
});

test("canApplyAIChatUiUpdate requires the current session and a mounted component", () => {
  const sessionRef = { current: 7 };
  const isMountedRef = { current: true };

  assert.equal(canApplyAIChatUiUpdate(7, sessionRef, isMountedRef), true);
  assert.equal(canApplyAIChatUiUpdate(6, sessionRef, isMountedRef), false);

  isMountedRef.current = false;
  assert.equal(canApplyAIChatUiUpdate(7, sessionRef, isMountedRef), false);
});

test("canRetryAIChatRequest also requires the request to still be processing", () => {
  const sessionRef = { current: 2 };
  const isMountedRef = { current: true };
  const processingRef = { current: true };

  assert.equal(canRetryAIChatRequest(2, sessionRef, isMountedRef, processingRef), true);

  processingRef.current = false;
  assert.equal(canRetryAIChatRequest(2, sessionRef, isMountedRef, processingRef), false);
});
