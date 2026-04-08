import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAIPageMessage,
  formatAIQueueBusyNotice,
  formatAIQueuedNotice,
  getAIPageStatusContent,
} from "./ai-page-controller-utils";

test("AI page message helper keeps newest messages only", () => {
  const messages = [
    { id: "ai-msg-1", role: "user" as const, content: "one", timestamp: "1" },
    { id: "ai-msg-2", role: "assistant" as const, content: "two", timestamp: "2" },
  ];

  const next = appendAIPageMessage(messages, {
    role: "user",
    content: "three",
    timestamp: "3",
  }, 2);

  assert.deepEqual(next.map((message) => message.content), ["two", "three"]);
});

test("AI page status helper returns labels and style classes for page status banners", () => {
  assert.equal(getAIPageStatusContent("IDLE").text, "AI idle.");
  assert.equal(getAIPageStatusContent("SEARCHING").text, "AI sedang mencari maklumat...");
  assert.match(getAIPageStatusContent("PROCESSING").className, /amber/);
  assert.match(getAIPageStatusContent("TYPING").className, /emerald/);
});

test("AI page queue notice helpers format wait copy consistently", () => {
  assert.equal(
    formatAIQueueBusyNotice(2, 5, 4500),
    "AI queue busy (2/5). Estimated wait 5s.",
  );
  assert.equal(
    formatAIQueueBusyNotice(5, 5, 0),
    "AI queue busy (5/5). Please retry shortly.",
  );
  assert.equal(
    formatAIQueuedNotice(2400),
    "AI request queued for 2s due to current traffic.",
  );
});
