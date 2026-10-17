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

test("resolveFloatingAiLayout lifts the mobile trigger above wide bottom action surfaces", () => {
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
        left: 12,
        top: 700,
        right: 378,
        bottom: 824,
      },
    ],
  });

  assert.ok(layout.trigger.bottom > 16);
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
  assert.ok(layout.panel.height >= 620);
  assert.ok(layout.panel.height < 844);
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

  assert.equal(layout.panel.mode, "fullscreen");
  assert.equal(layout.panel.alignment, "center");
  assert.equal(layout.panel.width, 320);
  assert.equal(layout.panel.height, 640);
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

test("resolveFloatingAiLayout keeps compact mobile idle sheets tall enough to preserve a usable message area", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 430,
    viewportHeight: 932,
    viewportBottomInset: 0,
    isMobile: true,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: false,
    preferCompactPanel: true,
    avoidRects: [],
  });

  assert.equal(layout.panel.mode, "sheet");
  assert.ok(layout.panel.width >= 400);
  assert.ok(layout.panel.height >= 660);
});

test("resolveFloatingAiLayout keeps mobile sheets inside the viewport when tall audit panels are visible", () => {
  const viewportHeight = 844;
  const layout = resolveFloatingAiLayout({
    viewportWidth: 390,
    viewportHeight,
    viewportBottomInset: 0,
    isMobile: true,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: true,
    preferCompactPanel: true,
    avoidRects: [
      {
        left: 33,
        top: 117,
        right: 342,
        bottom: 843,
      },
    ],
  });

  const panelTop = viewportHeight - layout.panel.bottom - layout.panel.height;
  assert.equal(layout.panel.mode, "sheet");
  assert.ok(layout.panel.bottom < 320);
  assert.ok(layout.panel.height >= 420);
  assert.ok(panelTop >= 20);
});

test("resolveFloatingAiLayout gives 412px mobile sheets enough height for a readable message region", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 412,
    viewportHeight: 915,
    viewportBottomInset: 0,
    isMobile: true,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: true,
    preferCompactPanel: false,
    avoidRects: [],
  });

  assert.equal(layout.panel.mode, "sheet");
  assert.ok(layout.panel.width >= 396);
  assert.ok(layout.panel.height >= 740);
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
  assert.ok(layout.panel.width >= 396);
  assert.ok(layout.panel.right !== null && layout.panel.right <= 24);
  assert.ok(layout.panel.height >= 400);
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
  assert.equal(layout.panel.alignment, "right");
  assert.ok(layout.panel.width >= 336);
  assert.ok(layout.panel.height >= 340);
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
  assert.equal(layout.panel.mode, "fullscreen");
  assert.equal(layout.panel.bottom, 280);
  assert.equal(layout.panel.height, 564);
});

test("resolveFloatingAiLayout keeps desktop trigger on the right even when bottom-right controls need clearance", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 1366,
    viewportHeight: 900,
    viewportBottomInset: 0,
    isMobile: false,
    isOpen: false,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: true,
    preferCompactPanel: false,
    avoidRects: [
      {
        left: 1110,
        top: 760,
        right: 1350,
        bottom: 880,
      },
    ],
  });

  assert.equal(layout.trigger.anchor, "right");
  assert.equal(layout.trigger.left, null);
  assert.ok(layout.trigger.right !== null && layout.trigger.right >= 24);
});

test("resolveFloatingAiLayout nudges the desktop panel without shrinking it into a tiny card", () => {
  const layout = resolveFloatingAiLayout({
    viewportWidth: 1366,
    viewportHeight: 900,
    viewportBottomInset: 0,
    isMobile: false,
    isOpen: true,
    hasBlockingDialog: false,
    keyboardOpen: false,
    hasFocusedEditable: false,
    hasDensePage: true,
    preferCompactPanel: false,
    avoidRects: [
      {
        left: 1100,
        top: 760,
        right: 1350,
        bottom: 880,
      },
    ],
  });

  assert.equal(layout.panel.mode, "dock");
  assert.equal(layout.panel.alignment, "right");
  assert.ok(layout.panel.width >= 396);
  assert.ok(layout.panel.height >= 380);
  assert.ok(layout.panel.right !== null && layout.panel.right >= 24);
});

test("save collection can place the idle launcher above dense footer controls between the fixed offsets", () => {
  const avoidRects = [
    { left: 45, right: 345, top: 534, bottom: 578 },
    { left: 33, right: 358, top: 632, bottom: 814 },
    { left: 45, right: 345, top: 698, bottom: 742 },
    { left: 45, right: 345, top: 750, bottom: 794 },
  ];
  const input = {
    viewportWidth: 391, viewportHeight: 845, viewportBottomInset: 0,
    isMobile: true, isOpen: false, hasBlockingDialog: false, keyboardOpen: false,
    hasFocusedEditable: false, hasDensePage: true, preferCompactPanel: true, avoidRects,
  };
  const overlapsControls = (layout: ReturnType<typeof resolveFloatingAiLayout>) => {
    const { trigger } = layout;
    const left = trigger.left ?? input.viewportWidth - (trigger.right ?? 0) - trigger.size;
    const top = input.viewportHeight - trigger.bottom - trigger.size;
    return avoidRects.some((rect) => Math.min(left + trigger.size, rect.right) > Math.max(left, rect.left)
      && Math.min(top + trigger.size, rect.bottom) > Math.max(top, rect.top));
  };
  assert.equal(overlapsControls(resolveFloatingAiLayout(input)), true);
  const adapted = resolveFloatingAiLayout({ ...input, allowAdaptiveTriggerOffsets: true });
  assert.equal(overlapsControls(adapted), false);
  assert.ok(adapted.trigger.bottom > 232);
  assert.equal(adapted.rootHidden, false);
  assert.equal(adapted.triggerHidden, false);
});

test("adaptive Save launcher scores landscape obstacles against the real short viewport", () => {
  const avoidRects = [
    { left: 33, right: 707, top: 250, bottom: 344 },
    { left: 45, right: 695, top: 180, bottom: 224 },
  ];
  const input = {
    viewportWidth: 740, viewportHeight: 360, viewportBottomInset: 0,
    isMobile: true, isOpen: false, hasBlockingDialog: false, keyboardOpen: false,
    hasFocusedEditable: false, hasDensePage: true, preferCompactPanel: true,
    allowAdaptiveTriggerOffsets: true, avoidRects,
  };
  const layout = resolveFloatingAiLayout(input);
  const left = layout.trigger.left ?? input.viewportWidth - (layout.trigger.right ?? 0) - layout.trigger.size;
  const top = input.viewportHeight - layout.trigger.bottom - layout.trigger.size;
  assert.ok(top >= 72);
  assert.ok(top + layout.trigger.size <= input.viewportHeight);
  assert.equal(avoidRects.some((rect) => Math.min(left + layout.trigger.size, rect.right) > Math.max(left, rect.left)
    && Math.min(top + layout.trigger.size, rect.bottom) > Math.max(top, rect.top)), false);
  const legacy = resolveFloatingAiLayout({ ...input, allowAdaptiveTriggerOffsets: false });
  assert.deepEqual(layout.panel, legacy.panel);
});
