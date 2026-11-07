import assert from "node:assert/strict";
import test from "node:test";
import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AIMessage, { AIMessageContent } from "./AIMessage";
import { AIConversationCard } from "@/pages/ai/AIConversationCard";
import { getAIPageStatusContent } from "@/pages/ai/ai-page-controller-utils";

const noop = () => undefined;
const timestamp = "2026-11-07T01:00:00.000Z";
const formattedAnswer = [
  "Ringkasan 000123:", "Baris kedua", "",
  "- Kutipan RM 100.00", "* Baki RM 25.00", "",
  "1. Semak rekod", "2) Sahkan jumlah", "",
  "```txt", "  rujukan 000123", "\tjumlah 100.00", "```",
].join("\n");
const unsafeAnswer = 'Sebelum\u0000\u202e000123\u2066 selepas\n'
  + '<script>alert(1)</script><svg onload="alert(2)"></svg>'
  + '<img src="javascript:alert(3)" onerror="alert(4)">'
  + '<a href="javascript:alert(5)" onclick="alert(6)">Semak rekod</a>'
  + '<strong>teks biasa</strong>';

function renderContent(content: string) {
  return renderToStaticMarkup(createElement(AIMessageContent, { content }));
}

function renderFullPage(content: string, streaming: boolean) {
  const props: ComponentProps<typeof AIConversationCard> = {
    assistantLabel: "AI SQR", aiEnabled: true, embedded: false,
    showResetButton: false,
    messages: streaming ? [] : [{ id: "assistant-1", role: "assistant", content, timestamp }],
    isThinking: streaming, query: "", aiStatus: streaming ? "TYPING" : "IDLE",
    gateNotice: null, slowNotice: false,
    streamingText: streaming ? content : "", streamingTimestamp: timestamp,
    isProcessing: streaming, isTyping: streaming,
    statusContent: getAIPageStatusContent(streaming ? "TYPING" : "IDLE"),
    messagesContainerRef: createRef<HTMLDivElement>(),
    onQueryChange: noop, onSend: noop, onCancel: noop, onReset: noop,
  };
  return renderToStaticMarkup(createElement(AIConversationCard, props));
}

test("AI message paragraphs preserve boundaries, line breaks and identifier zeroes", () => {
  const markup = renderContent("Ringkasan 000123\r\nBaris kedua\r\n\r\nJumlah RM 100.00");
  const paragraphs = [...markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)];

  assert.equal(paragraphs.length, 2);
  assert.match(paragraphs[0]![1]!, /<span>Ringkasan 000123<\/span><span><br\s*\/>Baris kedua<\/span>/);
  assert.equal(paragraphs[1]![1], "<span>Jumlah RM 100.00</span>");
});

test("AI message bullet and numbered groups render actual separate semantic lists", () => {
  const markup = renderContent("- Kutipan RM 100.00\n* Baki RM 25.00\n\n1. Semak rekod\n2) Sahkan jumlah");
  const lists = [...markup.matchAll(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/g)];

  assert.equal(lists.length, 2);
  assert.equal(lists[0]![1], "ul");
  assert.equal(lists[0]![2], "<li>Kutipan RM 100.00</li><li>Baki RM 25.00</li>");
  assert.equal(lists[1]![1], "ol");
  assert.equal(lists[1]![2], "<li>Semak rekod</li><li>Sahkan jumlah</li>");
  assert.doesNotMatch(markup, /<p\b/);
});

test("AI formatting preserves leading-zero identifiers and a numbered list's starting value", () => {
  const identifiers = renderContent("000123. Rujukan sintetik\n1000384115000013. Nombor akaun");
  assert.doesNotMatch(identifiers, /<ol\b/);
  assert.match(identifiers, /000123\. Rujukan sintetik/);
  assert.match(identifiers, /1000384115000013\. Nombor akaun/);
  assert.match(renderContent("7. Semak rekod\n8. Sahkan jumlah"), /<ol\b[^>]*start="7"/);
});

test("AI fenced code retains indentation and exposes a named keyboard region", () => {
  const markup = renderContent("Sebelum\n\n```js\n  const value = 7;\n\treturn value;\n```\n\nSelepas");
  const pre = markup.match(/<pre\b[^>]*>/)?.[0];

  assert.ok(pre);
  assert.match(pre, /tabindex="0"/);
  assert.match(pre, /role="region"/);
  assert.match(pre, /aria-label="Kod dalam jawapan AI"/);
  assert.ok(markup.includes('<code data-language="js">  const value = 7;\n\treturn value;</code>'));
  assert.equal([...markup.matchAll(/<p\b/g)].length, 2);
  assert.ok(markup.indexOf("Sebelum") < markup.indexOf("<pre"));
  assert.ok(markup.indexOf("</pre>") < markup.indexOf("Selepas"));
});

test("AI unfinished streaming fences remain code without losing their current whitespace", () => {
  const markup = renderContent("```txt\n  rujukan 000123\n\tjumlah ");

  assert.ok(markup.includes('<code data-language="txt">  rujukan 000123\n\tjumlah </code>'));
  assert.equal([...markup.matchAll(/<pre\b/g)].length, 1);
  assert.doesNotMatch(markup, /<p\b|```/);
});

test("AI content sanitizes hostile attributes and controls and never creates literal HTML nodes", () => {
  const markup = renderContent(unsafeAnswer);

  assert.match(markup, /Sebelum000123 selepas/);
  assert.match(markup, /Semak rekod/);
  assert.match(markup, /teks biasa/);
  assert.doesNotMatch(markup, /<(?:script|svg|img|a|strong)\b/i);
  assert.doesNotMatch(markup, /\bonload=|\bonerror=|\bonclick=|javascript:/i);
  for (const control of ["\u0000", "\u202e", "\u2066"]) {
    assert.equal(markup.includes(control), false);
  }
});

test("full-page finalized and streaming answers preserve the floating message formatter and sanitizer", () => {
  for (const content of [formattedAnswer, "```txt\n  rujukan 000123\n\tjumlah ", unsafeAnswer]) {
    const expected = renderContent(content);
    const floating = renderToStaticMarkup(createElement(AIMessage, { messageRole: "assistant", content }));

    assert.ok(expected.length > 0);
    for (const markup of [floating, renderFullPage(content, false), renderFullPage(content, true)]) {
      assert.ok(markup.includes(expected), "Every answer surface must render the complete shared content fragment");
      assert.equal(markup.indexOf(expected), markup.lastIndexOf(expected), "The answer must be rendered exactly once");
      assert.match(markup, /role="article" aria-label="Mesej pembantu AI"/);
      assert.doesNotMatch(markup, /<(?:script|img|strong)\b|javascript:/i);
    }
  }
});

test("empty AI content does not manufacture paragraphs or list items", () => {
  assert.equal(renderContent(""), "");
  assert.equal(renderContent(" \r\n\t\n"), "");
});
