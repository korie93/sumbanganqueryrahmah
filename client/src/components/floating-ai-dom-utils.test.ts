import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOATING_AI_AVOID_SELECTOR,
  FLOATING_AI_DIALOG_SELECTOR,
  collectFloatingAiDomSnapshot,
  queryFloatingAiObstacleElements,
  resolveFloatingAiHasDensePage,
} from "@/components/floating-ai-dom-utils";

test("resolveFloatingAiHasDensePage detects dense operational routes", () => {
  assert.equal(resolveFloatingAiHasDensePage("monitor", "/monitor"), true);
  assert.equal(resolveFloatingAiHasDensePage("viewer", "/imports/123/viewer"), true);
  assert.equal(resolveFloatingAiHasDensePage("home", "/"), false);
});

test("queryFloatingAiObstacleElements collects avoid, dialog, and observed elements in one pass", () => {
  const avoidElement = { id: "avoid" };
  const dialogElement = { id: "dialog" };
  const selectors: string[] = [];
  const documentStub = {
    querySelectorAll(selector: string) {
      selectors.push(selector);
      if (selector === FLOATING_AI_AVOID_SELECTOR) {
        return [avoidElement];
      }
      if (selector === FLOATING_AI_DIALOG_SELECTOR) {
        return [dialogElement];
      }
      return [];
    },
  } as unknown as Document;

  const result = queryFloatingAiObstacleElements(documentStub);

  assert.deepEqual(selectors, [FLOATING_AI_AVOID_SELECTOR, FLOATING_AI_DIALOG_SELECTOR]);
  assert.deepEqual(result.avoidElements, [avoidElement]);
  assert.deepEqual(result.dialogElements, [dialogElement]);
  assert.deepEqual(result.observedElements, [avoidElement, dialogElement]);
});

test("collectFloatingAiDomSnapshot reuses queried elements to derive visible rects and dialog state", () => {
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  type FakeRectInit = {
    left: number;
    top: number;
    width: number;
    height: number;
  };

  class FakeHTMLElement {
    readonly isContentEditable = false;
    readonly tagName = "DIV";

    constructor(
      private readonly rect: FakeRectInit,
      readonly style: { display: string; visibility: string } = {
        display: "block",
        visibility: "visible",
      },
    ) {}

    getBoundingClientRect(): DOMRect {
      const { left, top, width, height } = this.rect;
      return {
        bottom: top + height,
        height,
        left,
        right: left + width,
        top,
        width,
      } as DOMRect;
    }
  }

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeHTMLElement,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      getComputedStyle(element: FakeHTMLElement) {
        return element.style as CSSStyleDeclaration;
      },
    },
    writable: true,
  });

  try {
    const visibleAvoid = new FakeHTMLElement({ left: 12, top: 24, width: 48, height: 36 });
    const hiddenAvoid = new FakeHTMLElement(
      { left: 0, top: 0, width: 0, height: 0 },
      { display: "none", visibility: "hidden" },
    );
    const visibleDialog = new FakeHTMLElement({ left: 80, top: 16, width: 120, height: 90 });

    const snapshot = collectFloatingAiDomSnapshot({
      avoidElements: [visibleAvoid, hiddenAvoid] as unknown as Element[],
      dialogElements: [visibleDialog] as unknown as Element[],
      observedElements: [visibleAvoid, hiddenAvoid, visibleDialog] as unknown as Element[],
    });

    assert.deepEqual(snapshot.avoidRects, [
      {
        bottom: 60,
        height: 36,
        left: 12,
        right: 60,
        top: 24,
        width: 48,
      },
    ]);
    assert.equal(snapshot.hasBlockingDialog, true);
  } finally {
    if (originalHTMLElement) {
      Object.defineProperty(globalThis, "HTMLElement", originalHTMLElement);
    } else {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    }

    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
