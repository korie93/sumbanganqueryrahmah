import test from "node:test";
import assert from "node:assert/strict";

import { areFloatingAiLayoutsEqual, resolveFloatingAiLayout } from "@/components/floating-ai-layout";

for (const width of [320, 740]) {
  for (const inset of [0, 120]) {
    test(`fullscreen AI uses the actual 360px landscape height at ${width}px, inset ${inset}`, () => {
      const { panel } = resolveFloatingAiLayout({
        viewportWidth: width, viewportHeight: 360, viewportBottomInset: inset,
        isMobile: true, isOpen: true, hasBlockingDialog: false,
        keyboardOpen: inset > 0, hasFocusedEditable: false,
        hasDensePage: false, preferCompactPanel: false, avoidRects: [],
      });
      assert.equal(panel.mode, "fullscreen");
      assert.equal(panel.height, 360 - inset);
      assert.equal(panel.bottom, inset);
    });
  }
}

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

test("adaptive mobile placement can use a 64px gap between full-height value columns", () => {
  const input = {
    viewportWidth: 375, viewportHeight: 900, viewportBottomInset: 0,
    isMobile: true, isOpen: false, hasBlockingDialog: false, keyboardOpen: false,
    hasFocusedEditable: false, hasDensePage: true, preferCompactPanel: true,
    avoidRects: [
      { left: 0, right: 150, top: 72, bottom: 900 },
      { left: 214, right: 375, top: 72, bottom: 900 },
    ],
  };
  const intersects = (layout: ReturnType<typeof resolveFloatingAiLayout>) => {
    const { trigger } = layout;
    const left = trigger.left ?? input.viewportWidth - (trigger.right ?? 0) - trigger.size;
    const top = input.viewportHeight - trigger.bottom - trigger.size;
    return input.avoidRects.some((rect) =>
      Math.min(left + trigger.size, rect.right) > Math.max(left, rect.left)
      && Math.min(top + trigger.size, rect.bottom) > Math.max(top, rect.top));
  };
  const legacy = resolveFloatingAiLayout(input);
  assert.deepEqual(resolveFloatingAiLayout({ ...input, allowAdaptiveTriggerOffsets: false }), legacy);
  assert.equal(intersects(legacy), true, "Neither corner can clear both full-height columns");
  const adapted = resolveFloatingAiLayout({ ...input, allowAdaptiveTriggerOffsets: true });
  assert.equal(intersects(adapted), false);
  assert.equal(adapted.trigger.anchor, "right");
  assert.equal(adapted.trigger.size, 48);
  assert.equal(input.viewportWidth - adapted.trigger.right! - adapted.trigger.size, 158);
  assert.equal(adapted.rootHidden, false);
  assert.equal(adapted.triggerHidden, false);
  assert.deepEqual(adapted.panel, legacy.panel, "Only trigger candidates change");
});

test("adaptive mobile candidates keep the original corners when their bottom positions are clear", () => {
  const input = {
    viewportWidth: 375, viewportHeight: 900, viewportBottomInset: 0,
    isMobile: true, isOpen: false, hasBlockingDialog: false, keyboardOpen: false,
    hasFocusedEditable: false, hasDensePage: true, preferCompactPanel: true,
    allowAdaptiveTriggerOffsets: true,
    avoidRects: [{ left: 100, right: 260, top: 200, bottom: 500 }],
  };
  const original = resolveFloatingAiLayout({ ...input, allowAdaptiveTriggerOffsets: false });
  assert.deepEqual(resolveFloatingAiLayout(input), original);
  const rightBlocked = {
    ...input, avoidRects: [{ left: 300, right: 375, top: 72, bottom: 900 }],
  };
  assert.deepEqual(
    resolveFloatingAiLayout(rightBlocked).trigger,
    resolveFloatingAiLayout({ ...rightBlocked, allowAdaptiveTriggerOffsets: false }).trigger,
  );
  assert.equal(resolveFloatingAiLayout(rightBlocked).trigger.anchor, "left");
});

test("adaptive desktop placement uses the 72px content gap without covering a sidebar", () => {
  const input = {
    viewportWidth: 768, viewportHeight: 900, viewportBottomInset: 0,
    isMobile: false, isOpen: false, hasBlockingDialog: false, keyboardOpen: false,
    hasFocusedEditable: false, hasDensePage: true, preferCompactPanel: true,
    avoidRects: [
      { left: 0, right: 240, top: 0, bottom: 900 },
      { left: 240, right: 570, top: 92, bottom: 900 },
      { left: 642, right: 768, top: 92, bottom: 900 },
    ],
  };
  const intersectsWithClearance = (layout: ReturnType<typeof resolveFloatingAiLayout>) => {
    const { trigger } = layout;
    const left = input.viewportWidth - trigger.right! - trigger.size;
    const top = input.viewportHeight - trigger.bottom - trigger.size;
    return input.avoidRects.some((rect) =>
      Math.min(left + trigger.size + 8, rect.right) > Math.max(left - 8, rect.left)
      && Math.min(top + trigger.size + 8, rect.bottom) > Math.max(top - 8, rect.top));
  };
  const legacy = resolveFloatingAiLayout(input);
  assert.deepEqual(resolveFloatingAiLayout({ ...input, allowAdaptiveTriggerOffsets: false }), legacy);
  assert.ok([24, 96, 168, 240].includes(legacy.trigger.right!));
  assert.equal(intersectsWithClearance(legacy), true, "All four legacy positions intersect content");
  const adapted = resolveFloatingAiLayout({ ...input, allowAdaptiveTriggerOffsets: true });
  assert.equal(intersectsWithClearance(adapted), false);
  assert.equal(adapted.trigger.anchor, "right");
  assert.equal(adapted.trigger.left, null);
  assert.equal(adapted.trigger.size, 56);
  assert.equal(input.viewportWidth - adapted.trigger.right! - adapted.trigger.size, 578);
  assert.ok(adapted.trigger.right! >= 24);
  const top = input.viewportHeight - adapted.trigger.bottom - adapted.trigger.size;
  assert.ok(top >= 92 && top + adapted.trigger.size <= input.viewportHeight - 24);
  assert.equal(adapted.rootHidden, false);
  assert.equal(adapted.triggerHidden, false);
  assert.deepEqual(adapted.panel, legacy.panel, "Gap candidates only affect the launcher");
  assert.deepEqual(resolveFloatingAiLayout({
    ...input, allowAdaptiveTriggerOffsets: true, avoidRects: [...input.avoidRects].reverse(),
  }), adapted);
});

test("adaptive desktop candidates retain an unobstructed legacy corner", () => {
  const input = {
    viewportWidth: 768, viewportHeight: 900, viewportBottomInset: 0,
    isMobile: false, isOpen: false, hasBlockingDialog: false, keyboardOpen: false,
    hasFocusedEditable: false, hasDensePage: true, preferCompactPanel: true,
    avoidRects: [
      { left: 0, right: 240, top: 0, bottom: 900 },
      { left: 300, right: 500, top: 200, bottom: 500 },
    ],
  };
  assert.deepEqual(
    resolveFloatingAiLayout({ ...input, allowAdaptiveTriggerOffsets: true }),
    resolveFloatingAiLayout(input),
  );
});

test("adaptive mobile placement remains deterministic and bounded with 200 obstacle rectangles", () => {
  const avoidRects = Array.from({ length: 200 }, (_, index) => ({
    left: 10 + (index * 17) % 300,
    right: 20 + (index * 17) % 300,
    top: 80 + (index * 23) % 740,
    bottom: 92 + (index * 23) % 740,
  }));
  const input = {
    viewportWidth: 375, viewportHeight: 900, viewportBottomInset: 0,
    isMobile: true, isOpen: false, hasBlockingDialog: false, keyboardOpen: false,
    hasFocusedEditable: false, hasDensePage: true, preferCompactPanel: true,
    allowAdaptiveTriggerOffsets: true, avoidRects,
  };
  const resolved = resolveFloatingAiLayout(input);
  assert.deepEqual(resolveFloatingAiLayout(input), resolved);
  assert.deepEqual(resolveFloatingAiLayout({ ...input, avoidRects: [...avoidRects].reverse() }), resolved);
  const { trigger } = resolved;
  const left = trigger.left ?? input.viewportWidth - (trigger.right ?? 0) - trigger.size;
  const top = input.viewportHeight - trigger.bottom - trigger.size;
  assert.ok(Number.isFinite(left) && Number.isFinite(top));
  assert.ok(left >= 12 && left + trigger.size <= input.viewportWidth - 12);
  assert.ok(top >= 72 && top + trigger.size <= input.viewportHeight - 16);
  assert.equal(trigger.size, 48);
  assert.equal(resolved.rootHidden, false);
  assert.equal(resolved.triggerHidden, false);
  const desktopInput = { ...input, viewportWidth: 768, isMobile: false };
  const desktop = resolveFloatingAiLayout(desktopInput);
  const legacyDesktop = resolveFloatingAiLayout({ ...desktopInput, allowAdaptiveTriggerOffsets: false });
  assert.ok([24, 96, 168, 240].includes(legacyDesktop.trigger.right!));
  assert.deepEqual(resolveFloatingAiLayout(desktopInput), desktop);
  assert.equal(desktop.trigger.anchor, "right");
  assert.equal(desktop.trigger.left, null);
  const desktopLeft = desktopInput.viewportWidth - desktop.trigger.right! - desktop.trigger.size;
  const desktopTop = desktopInput.viewportHeight - desktop.trigger.bottom - desktop.trigger.size;
  assert.ok(Number.isFinite(desktopLeft) && Number.isFinite(desktopTop));
  assert.ok(desktopLeft >= 24 && desktopLeft + desktop.trigger.size <= desktopInput.viewportWidth - 24);
  assert.ok(desktopTop >= 92 && desktopTop + desktop.trigger.size <= desktopInput.viewportHeight - 24);
  assert.equal(desktop.trigger.size, 56);
  assert.equal(desktop.rootHidden, false);
  assert.equal(desktop.triggerHidden, false);
  assert.deepEqual(desktop.panel, legacyDesktop.panel);
});
