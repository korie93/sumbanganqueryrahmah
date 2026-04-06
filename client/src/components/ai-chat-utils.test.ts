import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAIChatMessage,
  formatAIChatQueueBusyNotice,
  formatAIChatQueuedNotice,
  getAIChatErrorDetailsFromPayload,
  getAIChatStatusMeta,
  getAIChatTypingDelayMs,
} from "@/components/ai-chat-utils";

test("appendAIChatMessage trims to the newest messages only", () => {
  const messages = Array.from({ length: 3 }, (_, index) => ({
    role: "user" as const,
    content: `message-${index + 1}`,
    timestamp: `${index + 1}`,
  }));

  const next = appendAIChatMessage(messages, {
    role: "assistant",
    content: "message-4",
    timestamp: "4",
  }, 3);

  assert.deepEqual(
    next.map((message) => message.content),
    ["message-2", "message-3", "message-4"],
  );
});

test("getAIChatStatusMeta returns user-facing labels for each state", () => {
  assert.equal(getAIChatStatusMeta("IDLE").text, "AI idle.");
  assert.equal(getAIChatStatusMeta("SEARCHING").text, "AI sedang mencari maklumat...");
  assert.equal(getAIChatStatusMeta("PROCESSING").text, "AI sedang memproses data...");
  assert.equal(getAIChatStatusMeta("TYPING").text, "AI sedang menaip jawapan...");
});

test("getAIChatTypingDelayMs slows down typing in low-spec mode", () => {
  assert.equal(getAIChatTypingDelayMs(false), 14);
  assert.equal(getAIChatTypingDelayMs(true), 18);
});

test("AI chat queue notices preserve existing copy", () => {
  assert.equal(
    formatAIChatQueueBusyNotice(3, 5, 2400),
    "AI queue busy (3/5). Estimated wait 2s.",
  );
  assert.equal(
    formatAIChatQueueBusyNotice(3, 5, 0),
    "AI queue busy (3/5). Please retry shortly.",
  );
  assert.equal(
    formatAIChatQueuedNotice(2400),
    "AI request queued for 2s due to current traffic.",
  );
});

test("getAIChatErrorDetailsFromPayload extracts message and queue notice", () => {
  const details = getAIChatErrorDetailsFromPayload({
    message: "  queue penuh  ",
    gate: {
      queueLimit: "4",
      queueSize: "3",
      queueWaitMs: "1500",
    },
  });

  assert.equal(details.message, "queue penuh");
  assert.equal(details.gateNotice, "AI queue busy (3/4). Estimated wait 2s.");
});

test("getAIChatErrorDetailsFromPayload falls back on malformed payload", () => {
  const details = getAIChatErrorDetailsFromPayload(null, "fallback");

  assert.equal(details.message, "fallback");
  assert.equal(details.gateNotice, null);
});
