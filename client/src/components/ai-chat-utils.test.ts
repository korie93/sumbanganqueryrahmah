import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAIChatMessage,
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
