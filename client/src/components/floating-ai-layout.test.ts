import test from "node:test";
import assert from "node:assert/strict";

import { areFloatingAiLayoutsEqual, resolveFloatingAiLayout } from "@/components/floating-ai-layout";

test("resolveFloatingAiLayout moves the trigger away from bottom-right avoid zones", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 390,
    viewportHeight: 844,
    viewportBottomInset: 0,
    isMobile: true,
    isOpen: false,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: true,
    preferCompactPanel: false,
    avoidRects: [
      {
        left: 220,
        top: 730,
        right: 382,
        bottom: 820,
      },
    ],
  });

  assert.equal(layout.trigger.anchor, "left");
  assert.equal(layout.trigger.left, 12);
  assert.equal(layout.trigger.right, null);
});

test("resolveFloatingAiLayout lifts the mobile panel above bottom action bars", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 390,
    viewportHeight: 844,
    viewportBottomInset: 0,
    isMobile: true,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: true,
    preferCompactPanel: false,
    avoidRects: [
      {
        left: 0,
        top: 760,
        right: 390,
        bottom: 830,
      },
    ],
  });

  assert.equal(layout.panel.mode, "sheet");
  assert.equal(layout.panel.alignment, "center");
  assert.ok(layout.panel.bottom > 16);
  assert.ok(layout.panel.height <= 360);
});

test("resolveFloatingAiLayout auto-minimizes when a blocking dialog is open", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 430,
    viewportHeight: 932,
    viewportBottomInset: 0,
    isMobile: true,
    isOpen: true,
    hasBlockingDialog: true,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: false,
    preferCompactPanel: false,
    avoidRects: [],
  });

  assert.equal(layout.rootHidden, true);
  assert.equal(layout.shouldAutoMinimize, true);
});

test("resolveFloatingAiLayout keeps 320px mobile view compact and centered", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 320,
    viewportHeight: 640,
    viewportBottomInset: 0,
    isMobile: true,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: true,
    preferCompactPanel: true,
    avoidRects: [],
  });

  assert.equal(layout.panel.mode, "sheet");
  assert.equal(layout.panel.alignment, "center");
  assert.ok(layout.panel.width <= 304);
  assert.ok(layout.panel.height <= 248);
});

test("resolveFloatingAiLayout auto-minimizes on 360px mobile when keyboard opens", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 360,
    viewportHeight: 740,
    viewportBottomInset: 280,
    isMobile: true,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: true,
    hasFocusedEditable: true,
    hasDensePage: false,
    preferCompactPanel: false,
    avoidRects: [],
  });

  assert.equal(layout.triggerHidden, true);
  assert.equal(layout.shouldAutoMinimize, true);
});

test("resolveFloatingAiLayout keeps the desktop panel docked compactly on the preferred side", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 1366,
    viewportHeight: 900,
    viewportBottomInset: 0,
    isMobile: false,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: false,
    preferCompactPanel: false,
    avoidRects: [],
  });

  assert.equal(layout.panel.mode, "dock");
  assert.equal(layout.panel.alignment, "right");
  assert.ok(layout.panel.width <= 392);
});

test("resolveFloatingAiLayout switches to dock mode for tablet widths", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 768,
    viewportHeight: 1024,
    viewportBottomInset: 0,
    isMobile: false,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: true,
    preferCompactPanel: false,
    avoidRects: [],
  });

  assert.equal(layout.panel.mode, "dock");
  assert.ok(layout.panel.height <= 420);
});

test("areFloatingAiLayoutsEqual stays stable for unchanged placement decisions", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 430,
    viewportHeight: 932,
    viewportBottomInset: 0,
    isMobile: true,
    isOpen: false,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: false,
    preferCompactPanel: false,
    avoidRects: [],
  });

  assert.equal(areFloatingAiLayoutsEqual(layout, layout), true);
});

test("resolveFloatingAiLayout lifts the panel above the mobile keyboard inset without auto-minimizing internal AI input", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 390,
    viewportHeight: 844,
    viewportBottomInset: 280,
    isMobile: true,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: true,
    hasFocusedEditable: false,
    hasDensePage: false,
    preferCompactPanel: true,
    avoidRects: [],
  });

  assert.equal(layout.shouldAutoMinimize, false);
  assert.ok(layout.panel.bottom >= 296);
});
