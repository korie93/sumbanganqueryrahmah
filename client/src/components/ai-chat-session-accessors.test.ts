import assert from "node:assert/strict";
import test from "node:test";

import { createAIChatSessionAccessors } from "@/components/ai-chat-session-accessors";

test("AI chat session accessors read the latest ref values without stale closures", () => {
  const sessionRef = { current: 2 };
  const isMountedRef = { current: true };
  const processingRef = { current: true };
  const accessors = createAIChatSessionAccessors(sessionRef, isMountedRef, processingRef);

  assert.equal(accessors.isActiveSession(2), true);
  assert.equal(accessors.canApplyUiUpdate(2), true);
  assert.equal(accessors.canRetryRequest(2), true);

  sessionRef.current = 3;
  processingRef.current = false;

  assert.equal(accessors.isActiveSession(2), false);
  assert.equal(accessors.isActiveSession(3), true);
  assert.equal(accessors.canApplyUiUpdate(2), false);
  assert.equal(accessors.canRetryRequest(3), false);

  isMountedRef.current = false;
  processingRef.current = true;

  assert.equal(accessors.canApplyUiUpdate(3), false);
  assert.equal(accessors.canRetryRequest(3), false);
});
