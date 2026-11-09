import assert from "node:assert/strict";
import test from "node:test";
import type { AIChatMessage, AIChatMessageInput } from "@/context/AIContext";
import { stopAIChatResponse } from "@/components/ai-chat-stop-response";
import { appendAIChatMessage, MAX_AI_CHAT_MESSAGES } from "@/components/ai-chat-utils";
import { appendAIPageMessage, AI_PAGE_MAX_CHAT_MESSAGES } from "@/pages/ai/ai-page-controller-utils";
import { canApplyAIChatUiUpdate } from "@/components/ai-chat-session-guards";

test("explicit Stop cancels the session before preserving the exact committed Unicode prefix", () => {
  const isMountedRef = { current: true }, processingRef = { current: true }, sessionRef = { current: 4 };
  const events: string[] = [], messages: AIChatMessageInput[] = [];
  const prefix = '  Perenggan 000123 🧾\n\n- Item\n```txt\n  nilai = "👨‍👩‍👧‍👦";';
  stopAIChatResponse({ isMountedRef, processingRef, streamingText: prefix,
    cancelResponse: () => { events.push("cancel"); sessionRef.current++; },
    appendMessage: (message) => { events.push("append"); messages.push(message); assert.equal(sessionRef.current, 5); },
  });
  assert.deepEqual(events, ["cancel", "append"]);
  assert.equal(processingRef.current, false);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.content, prefix);
  assert.equal(messages[0]?.role, "assistant");
  assert.equal(Number.isFinite(Date.parse(messages[0]!.timestamp)), true);
  assert.equal(canApplyAIChatUiUpdate(4, sessionRef, isMountedRef), false, "The old completion must not append after Stop");
});

test("Stop consumes active ownership before cancellation and cannot append twice on reentry or repeat", () => {
  const isMountedRef = { current: true }, processingRef = { current: true };
  let cancels = 0, appends = 0;
  const options = { isMountedRef, processingRef, streamingText: "Partial reply",
    cancelResponse: () => { cancels++; stopAIChatResponse(options); }, appendMessage: () => { appends++; } };
  stopAIChatResponse(options); stopAIChatResponse(options);
  assert.equal(cancels, 1); assert.equal(appends, 1);
});

test("Stop before the first nonblank token cancels without creating an empty assistant message", () => {
  for (const streamingText of ["", " \n\t "]) {
    const isMountedRef = { current: true }, processingRef = { current: true };
    let cancels = 0;
    stopAIChatResponse({ isMountedRef, processingRef, streamingText,
      cancelResponse: () => { cancels++; }, appendMessage: () => assert.fail("Blank prefix must not enter history") });
    assert.equal(cancels, 1); assert.equal(processingRef.current, false);
  }
});

test("completed, unmounted and newly unmounted owners cannot resurrect partial history", () => {
  for (const state of [{ mounted: false, active: true }, { mounted: true, active: false }]) {
    stopAIChatResponse({ isMountedRef: { current: state.mounted }, processingRef: { current: state.active }, streamingText: "Old reply",
      cancelResponse: () => assert.fail("No active mounted request"), appendMessage: () => assert.fail("No stale history") });
  }
  const isMountedRef = { current: true };
  stopAIChatResponse({ isMountedRef, processingRef: { current: true }, streamingText: "Old owner reply",
    cancelResponse: () => { isMountedRef.current = false; }, appendMessage: () => assert.fail("Unmount during cancellation discards history") });
});

for (const [surface, append, cap] of [
  ["floating", appendAIChatMessage, MAX_AI_CHAT_MESSAGES],
  ["full", appendAIPageMessage, AI_PAGE_MAX_CHAT_MESSAGES],
] as const) {
  test(`explicit Stop preserves the existing ${surface} history cap and a fresh session can append normally`, () => {
    let messages: AIChatMessage[] = Array.from({ length: cap }, (_, index) => ({ id: `old-${index}`,
      role: "user", content: `Question ${index}`, timestamp: "2026-11-09T00:00:00.000Z" }));
    const isMountedRef = { current: true }, processingRef = { current: true }, sessionRef = { current: 8 };
    const appendMessage = (message: AIChatMessageInput) => { messages = append(messages, { ...message, id: "stopped-8" }); };
    stopAIChatResponse({ isMountedRef, processingRef, streamingText: "Visible partial", appendMessage,
      cancelResponse: () => { sessionRef.current++; } });
    assert.equal(messages.length, cap); assert.equal(messages[0]?.id, "old-1");
    assert.equal(messages.filter((message) => message.id === "stopped-8").length, 1);
    assert.equal(canApplyAIChatUiUpdate(8, sessionRef, isMountedRef), false);
    sessionRef.current++;
    assert.equal(canApplyAIChatUiUpdate(10, sessionRef, isMountedRef), true);
    messages = append(messages, { role: "assistant", id: "fresh-10", content: "Fresh complete reply", timestamp: "2026-11-09T00:00:00.000Z" });
    assert.equal(messages.length, cap); assert.equal(messages[messages.length - 1]?.content, "Fresh complete reply");
  });
}
