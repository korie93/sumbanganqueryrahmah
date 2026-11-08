import assert from "node:assert/strict";
import test from "node:test";
import type { AIChatMessage } from "@/context/AIContext";
import { appendAIChatMessage, MAX_AI_CHAT_MESSAGES } from "@/components/ai-chat-utils";
import { countNewAIChatAssistantMessages, getAIChatAssistantMessageIds } from "@/components/ai-chat-unread";

const message = (id: string, role: AIChatMessage["role"] = "assistant"): AIChatMessage => ({
  id, role, content: "Repeated synthetic content", timestamp: "2026-11-09T00:00:00.000Z",
});

test("unread detection sees the next assistant ID when the retained assistant count stays at 15", () => {
  let messages: AIChatMessage[] = [];
  for (let index = 1; index <= 15; index++) {
    messages = appendAIChatMessage(messages, message(`user-${index}`, "user"));
    messages = appendAIChatMessage(messages, message(`assistant-${index}`));
  }
  const previousIds = getAIChatAssistantMessageIds(messages);
  messages = appendAIChatMessage(messages, message("user-16", "user"));
  assert.equal(countNewAIChatAssistantMessages(getAIChatAssistantMessageIds(messages), previousIds), 0);
  messages = appendAIChatMessage(messages, message("assistant-16"));
  const currentIds = getAIChatAssistantMessageIds(messages);
  assert.equal(messages.length, MAX_AI_CHAT_MESSAGES);
  assert.equal(previousIds.size, 15);
  assert.equal(currentIds.size, 15);
  assert.equal(currentIds.has("assistant-1"), false);
  assert.equal(countNewAIChatAssistantMessages(currentIds, previousIds), 1);
});

test("unread identity comparison counts batched replies once and ignores users, duplicate IDs and content edits", () => {
  const previousIds = getAIChatAssistantMessageIds([message("a"), message("u", "user")]);
  const currentIds = getAIChatAssistantMessageIds([
    { ...message("a"), content: "Edited existing reply" }, message("u2", "user"),
    message("b"), message("b"), message("c"), message("d"),
  ]);
  assert.equal(countNewAIChatAssistantMessages(currentIds, previousIds), 3);
  assert.equal(countNewAIChatAssistantMessages(currentIds, currentIds), 0);
  assert.equal(countNewAIChatAssistantMessages(getAIChatAssistantMessageIds([message("a"), message("u2", "user")]), previousIds), 0);
  assert.deepEqual([...previousIds], ["a"], "The previous snapshot must remain immutable");
});

test("existing history seeds a fresh owner snapshot without unread and reset releases all retained IDs", () => {
  const existingIds = getAIChatAssistantMessageIds([message("old-a"), message("old-b")]);
  assert.equal(countNewAIChatAssistantMessages(existingIds, existingIds), 0);
  const emptyIds = getAIChatAssistantMessageIds([]);
  assert.equal(countNewAIChatAssistantMessages(emptyIds, existingIds), 0);
  assert.equal(emptyIds.size, 0);
  const nextIds = getAIChatAssistantMessageIds([message("new-owner-user", "user"), message("new-owner-reply")]);
  assert.equal(countNewAIChatAssistantMessages(nextIds, emptyIds), 1);
  assert.deepEqual([...nextIds], ["new-owner-reply"]);
});

test("repeated capped snapshots retain only current IDs instead of accumulating a seen-message cache", () => {
  let messages: AIChatMessage[] = [];
  let previousIds = getAIChatAssistantMessageIds(messages);
  for (let index = 1; index <= 500; index++) {
    messages = appendAIChatMessage(messages, message(`u-${index}`, "user"));
    messages = appendAIChatMessage(messages, message(`a-${index}`));
    const currentIds = getAIChatAssistantMessageIds(messages);
    assert.equal(countNewAIChatAssistantMessages(currentIds, previousIds), 1);
    assert.ok(currentIds.size <= MAX_AI_CHAT_MESSAGES / 2);
    assert.ok(messages.length <= MAX_AI_CHAT_MESSAGES);
    previousIds = currentIds;
  }
  assert.equal(previousIds.size, 15);
  assert.equal(previousIds.has("a-1"), false);
  assert.equal(previousIds.has("a-500"), true);
});
