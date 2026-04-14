import assert from "node:assert/strict";
import test from "node:test";

import { handleUnexpectedAIChatSendError } from "@/components/ai-chat-send-guard";

test("handleUnexpectedAIChatSendError finalizes the active session with a fallback message", () => {
  const messages: Array<{ role: string; content: string }> = [];
  const finishCalls: Array<{ clearStreamingText?: boolean; gateNotice?: string | null } | undefined> = [];

  handleUnexpectedAIChatSendError({
    error: new Error("boom"),
    sessionId: 5,
    canApplyUiUpdate(sessionId) {
      return sessionId === 5;
    },
    appendMessage(message) {
      messages.push({
        role: message.role,
        content: message.content,
      });
    },
    finishAsyncCycle(options) {
      finishCalls.push(options);
    },
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.role, "assistant");
  assert.match(messages[0]?.content ?? "", /cuba semula/i);
  assert.deepEqual(finishCalls, [{
    clearStreamingText: true,
    gateNotice: null,
  }]);
});

test("handleUnexpectedAIChatSendError stays silent for inactive sessions", () => {
  let appended = false;
  let finished = false;

  handleUnexpectedAIChatSendError({
    error: new Error("boom"),
    sessionId: 3,
    canApplyUiUpdate() {
      return false;
    },
    appendMessage() {
      appended = true;
    },
    finishAsyncCycle() {
      finished = true;
    },
  });

  assert.equal(appended, false);
  assert.equal(finished, false);
});
