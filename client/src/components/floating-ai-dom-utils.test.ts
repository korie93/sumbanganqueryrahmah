import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOATING_AI_AVOID_SELECTOR,
  FLOATING_AI_DIALOG_SELECTOR,
  FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR,
  FLOATING_AI_SAVE_COLLECTION_LAYOUT_SELECTOR,
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

test("save collection obstacle queries opt into interactive controls without treating whole cards as obstacles", () => {
  const field = { id: "customer-name" };
  const nickname = { id: "save-nickname" };
  const workspace = { id: "save-workspace" };
  const selectors: string[] = [];
  const documentStub = {
    querySelectorAll(selector: string) {
      selectors.push(selector);
      if (selector === FLOATING_AI_SAVE_COLLECTION_LAYOUT_SELECTOR) return [workspace];
      return selector.includes(FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR) ? [field, nickname] : [];
    },
  } as unknown as Document;
  const snapshot = queryFloatingAiObstacleElements(documentStub, true);
  assert.deepEqual(snapshot.avoidElements, [field, nickname]);
  assert.deepEqual(snapshot.observedElements, [field, nickname, workspace]);
  assert.deepEqual(selectors, [
    `${FLOATING_AI_AVOID_SELECTOR}, ${FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR}`,
    FLOATING_AI_DIALOG_SELECTOR,
    FLOATING_AI_SAVE_COLLECTION_LAYOUT_SELECTOR,
  ]);
  assert.match(FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR, /\.save-collection-workspace :is\(input:not\(\[type='hidden'\]\)/);
  assert.match(FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR, /\.collection-save-nickname-controls :is\(button,/);
  assert.match(FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR, /button, summary,/);
  assert.doesNotMatch(FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR, /\.save-collection-section(?:,|$)/);
});

test("Saved observes its stable workspace root without treating the entire page as an obstacle", () => {
  const pagination = { id: "saved-pagination" };
  const sourceControl = { id: "saved-source-control" };
  const dialog = { id: "saved-dialog" };
  const workspace = { id: "saved-workspace" };
  const savedAvoidSelector = `${FLOATING_AI_AVOID_SELECTOR}, [data-saved-ai-avoid='true']`;
  const selectors: string[] = [];
  const documentStub = {
    querySelectorAll(selector: string) {
      selectors.push(selector);
      if (selector === FLOATING_AI_AVOID_SELECTOR) return [pagination];
      if (selector === savedAvoidSelector) return [pagination, sourceControl];
      if (selector === FLOATING_AI_DIALOG_SELECTOR) return [dialog];
      if (selector === ".saved-workspace") return [workspace];
      return [];
    },
  } as unknown as Document;

  const result = queryFloatingAiObstacleElements(documentStub, false, true);
  assert.deepEqual(selectors, [savedAvoidSelector, FLOATING_AI_DIALOG_SELECTOR, ".saved-workspace"]);
  assert.deepEqual(result.avoidElements, [pagination, sourceControl]);
  assert.deepEqual(result.dialogElements, [dialog]);
  assert.deepEqual(result.observedElements, [pagination, sourceControl, dialog, workspace]);
  assert.equal(result.avoidElements.includes(workspace as unknown as Element), false);
  assert.equal(result.dialogElements.includes(workspace as unknown as Element), false);

  selectors.length = 0;
  const defaultResult = queryFloatingAiObstacleElements(documentStub);
  assert.deepEqual(selectors, [FLOATING_AI_AVOID_SELECTOR, FLOATING_AI_DIALOG_SELECTOR]);
  assert.deepEqual(defaultResult.avoidElements, [pagination]);
  assert.deepEqual(defaultResult.observedElements, [pagination, dialog]);
  assert.equal(defaultResult.avoidElements.includes(sourceControl as unknown as Element), false);
  assert.equal(defaultResult.observedElements.includes(sourceControl as unknown as Element), false);
});

test("Saved layout observation composes with existing Save controls and deduplicates observed roots", () => {
  const control = { id: "source-control" };
  const saveWorkspace = { id: "save-workspace" };
  const savedWorkspace = { id: "saved-workspace" };
  const combinedAvoidSelector = `${FLOATING_AI_AVOID_SELECTOR}, ${FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR}, [data-saved-ai-avoid='true']`;
  const selectors: string[] = [];
  const documentStub = {
    querySelectorAll(selector: string) {
      selectors.push(selector);
      if (selector === combinedAvoidSelector) return [control];
      if (selector === `${FLOATING_AI_SAVE_COLLECTION_LAYOUT_SELECTOR}, .saved-workspace`) {
        return [saveWorkspace, savedWorkspace, control];
      }
      return [];
    },
  } as unknown as Document;

  const result = queryFloatingAiObstacleElements(documentStub, true, true);
  assert.deepEqual(selectors, [
    combinedAvoidSelector,
    FLOATING_AI_DIALOG_SELECTOR,
    `${FLOATING_AI_SAVE_COLLECTION_LAYOUT_SELECTOR}, .saved-workspace`,
  ]);
  assert.deepEqual(result.avoidElements, [control]);
  assert.deepEqual(result.observedElements, [control, saveWorkspace, savedWorkspace]);
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

test("collectFloatingAiDomSnapshot ignores the floating AI panel's own dialog semantics", () => {
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  class FakeHTMLElement {
    readonly isContentEditable = false;
    readonly tagName = "DIV";

    constructor(private readonly floatingAiOwned: boolean) {}

    getAttribute(name: string) {
      if (name === "data-floating-ai-dialog" && this.floatingAiOwned) {
        return "true";
      }

      return null;
    }

    getBoundingClientRect(): DOMRect {
      return {
        bottom: 120,
        height: 80,
        left: 24,
        right: 144,
        top: 40,
        width: 120,
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
      getComputedStyle() {
        return {
          display: "block",
          visibility: "visible",
        } as CSSStyleDeclaration;
      },
    },
    writable: true,
  });

  try {
    const snapshot = collectFloatingAiDomSnapshot({
      avoidElements: [],
      dialogElements: [new FakeHTMLElement(true)] as unknown as Element[],
      observedElements: [],
    });

    assert.equal(snapshot.hasBlockingDialog, false);
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
