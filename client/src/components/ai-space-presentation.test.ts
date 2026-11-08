import assert from "node:assert/strict";
import test from "node:test";
import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AIConversationCard } from "@/pages/ai/AIConversationCard";
import { getAIPageStatusContent } from "@/pages/ai/ai-page-controller-utils";
import { AIJumpToLatestButton } from "./AIJumpToLatestButton";

const noop = () => undefined;
const base: ComponentProps<typeof AIConversationCard> = {
  assistantLabel: "AI SQR", aiEnabled: true, embedded: false, showResetButton: true,
  messages: [], isThinking: false, query: "", aiStatus: "IDLE", gateNotice: null, slowNotice: false,
  streamingText: "", streamingTimestamp: "", isProcessing: false, isTyping: false,
  statusContent: getAIPageStatusContent("IDLE"), messagesContainerRef: createRef<HTMLDivElement>(),
  onQueryChange: noop, onSend: noop, onCancel: noop, onReset: noop,
};
const render = (changes: Partial<typeof base>) => renderToStaticMarkup(createElement(AIConversationCard, { ...base, ...changes }));
function visibleFeedback(markup: string) {
  return [...markup.matchAll(/<div\b[^>]*data-ai-feedback="true"[^>]*>([\s\S]*?)<\/div>/g)]
    .map(match => match[1]!.replace(/<[^>]*>/g, ""));
}

test("visible AI feedback is quiet when idle and keeps the reset control available", () => {
  const markup = render({ messages: [{ id: "one", role: "assistant", content: "Jawapan sintetik.", timestamp: "2026-11-08T00:00:00.000Z" }] });
  assert.deepEqual(visibleFeedback(markup), []);
  assert.match(markup, /aria-label="Sembang Baharu"/);
  assert.doesNotMatch(markup, /AI idle\./);
});

test("queued and slow AI feedback replace the phase text rather than adding more notices", () => {
  const processing = { aiStatus: "PROCESSING" as const, isThinking: true, isProcessing: true, statusContent: getAIPageStatusContent("PROCESSING") };
  const queued = render({ ...processing, slowNotice: true, retryAvailable: true, gateNotice: "Permintaan menunggu giliran." });
  assert.deepEqual(visibleFeedback(queued), ["Permintaan menunggu giliran."]);
  assert.doesNotMatch(queued, /AI sedang memproses data\.\.\.|Sistem masih memproses data\./);
  assert.deepEqual(visibleFeedback(render({ ...processing, slowNotice: true })), ["Jawapan mengambil masa lebih lama daripada biasa. Sistem masih memproses data."]);
  assert.deepEqual(visibleFeedback(render({ ...processing, retryAvailable: true })), ["Permintaan AI gagal. Cuba semula soalan terakhir tersedia."]);
});

test("typing feedback ignores a stale slow flag and queue text remains escaped", () => {
  const typing = { aiStatus: "TYPING" as const, isTyping: true, statusContent: getAIPageStatusContent("TYPING") };
  assert.deepEqual(visibleFeedback(render({ ...typing, slowNotice: true })), ["AI sedang menaip jawapan..."]);
  const typingRegion = render({ ...typing, slowNotice: true }).match(/<div\b[^>]*data-ai-feedback="true"[^>]*>/)![0];
  assert.ok(typingRegion.includes("text-emerald-700"));
  assert.ok(!typingRegion.includes("text-amber-700"));
  const markup = render({ ...typing, gateNotice: '<script>alert("test")</script>' });
  assert.equal(visibleFeedback(markup).length, 1);
  assert.ok(markup.includes("&lt;script&gt;"));
  assert.doesNotMatch(markup, /<script\b/);
});

test("disabled AI keeps its alert without a competing visual status", () => {
  const markup = render({ aiEnabled: false, aiStatus: "SEARCHING", gateNotice: "Giliran", retryAvailable: true });
  assert.deepEqual(visibleFeedback(markup), []);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Pembantu AI dinyahaktifkan oleh tetapan sistem\./);
});

test("jump control stays icon-only with its existing keyboard name and log relationship", () => {
  assert.equal(renderToStaticMarkup(createElement(AIJumpToLatestButton, { controlsId: "messages", visible: false, onJump: noop })), "");
  const markup = renderToStaticMarkup(createElement(AIJumpToLatestButton, { controlsId: "messages", visible: true, onJump: noop }));
  assert.match(markup, /class="ai-jump-to-latest/);
  assert.match(markup, /aria-label="Ke mesej terkini"/);
  assert.match(markup, /aria-controls="messages"/);
  assert.doesNotMatch(markup, />Ke mesej terkini</);
});
