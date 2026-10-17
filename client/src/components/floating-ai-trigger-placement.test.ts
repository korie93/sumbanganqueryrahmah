import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { FloatingTriggerShell } from "./FloatingAIShell";
import { resolveFloatingAiLayout } from "./floating-ai-layout";

test("the rendered launcher receives collision-aware placement coordinates", () => {
  const avoidRect = { left: 33, right: 358, top: 764, bottom: 808 };
  const layout = resolveFloatingAiLayout({
    viewportWidth: 390, viewportHeight: 844, viewportBottomInset: 0,
    isMobile: true, isOpen: false, hasBlockingDialog: false, keyboardOpen: false,
    hasFocusedEditable: false, hasDensePage: true, preferCompactPanel: true,
    avoidRects: [avoidRect],
  });
  const { trigger } = layout;
  const left = trigger.left ?? 390 - (trigger.right ?? 0) - trigger.size;
  const top = 844 - trigger.bottom - trigger.size;
  assert.equal(Math.max(0, Math.min(left + trigger.size, avoidRect.right) - Math.max(left, avoidRect.left))
    * Math.max(0, Math.min(top + trigger.size, avoidRect.bottom) - Math.max(top, avoidRect.top)), 0);
  const markup = renderToStaticMarkup(createElement(FloatingTriggerShell, {
    className: "launcher", hidden: false, placement: trigger, children: "AI",
  }));
  assert.match(markup, new RegExp(`--floating-ai-trigger-bottom:${trigger.bottom}px`));
  assert.match(markup, new RegExp(`--floating-ai-trigger-right:${trigger.right === null ? "auto" : `${trigger.right}px`}`));
  assert.match(markup, new RegExp(`--floating-ai-trigger-left:${trigger.left === null ? "auto" : `${trigger.left}px`}`));
  assert.doesNotMatch(markup, /hidden=/);
});

test("routes without opted-in launcher placement retain their CSS fallback coordinates", () => {
  const markup = renderToStaticMarkup(createElement(FloatingTriggerShell, {
    className: "launcher", hidden: false, children: "AI",
  }));
  assert.doesNotMatch(markup, /style=|--floating-ai-trigger-/);
});
