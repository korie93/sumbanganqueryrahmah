import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFloatingAiModalAccessibility,
  applyFloatingAiModalIsolation,
} from "@/components/floating-ai-accessibility";

class FakeElement {
  readonly attributes = new Map<string, string>();
  parentElement: { children: FakeElement[] } | null = null;

  constructor(initialAttributes?: Record<string, string>) {
    for (const [name, value] of Object.entries(initialAttributes ?? {})) {
      this.attributes.set(name, value);
    }
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  toggleAttribute(name: string, force?: boolean) {
    if (force === false) {
      this.attributes.delete(name);
      return false;
    }

    this.attributes.set(name, "");
    return true;
  }
}

class FakeDocument {
  activeElement: unknown = null;
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  addEventListener(type: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  dispatch(type: string, payload?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(payload);
    }
  }
}

class FakeFocusableElement extends FakeElement {
  constructor(
    private readonly documentObject: FakeDocument,
    initialAttributes?: Record<string, string>,
  ) {
    super(initialAttributes);
  }

  focus() {
    this.documentObject.activeElement = this;
  }
}

class FakeDialogElement extends FakeFocusableElement {
  private readonly descendants = new Set<unknown>();
  private focusableElements: FakeFocusableElement[] = [];

  registerFocusableElements(elements: FakeFocusableElement[]) {
    this.focusableElements = elements;
    this.descendants.clear();
    this.descendants.add(this);
    for (const element of elements) {
      this.descendants.add(element);
    }
  }

  contains(target: unknown) {
    return this.descendants.has(target);
  }

  querySelectorAll() {
    return this.focusableElements;
  }
}

test("applyFloatingAiModalIsolation hides and inerts sibling content until cleanup", () => {
  const before = new FakeElement();
  const root = new FakeElement();
  const after = new FakeElement();
  const parent = { children: [before, root, after] };

  before.parentElement = parent;
  root.parentElement = parent;
  after.parentElement = parent;

  const restore = applyFloatingAiModalIsolation(root);

  assert.equal(before.getAttribute("aria-hidden"), "true");
  assert.equal(before.getAttribute("inert"), "");
  assert.equal(after.getAttribute("aria-hidden"), "true");
  assert.equal(after.getAttribute("inert"), "");
  assert.equal(root.getAttribute("aria-hidden"), null);

  restore();

  assert.equal(before.getAttribute("aria-hidden"), null);
  assert.equal(before.getAttribute("inert"), null);
  assert.equal(after.getAttribute("aria-hidden"), null);
  assert.equal(after.getAttribute("inert"), null);
});

test("applyFloatingAiModalIsolation preserves pre-existing aria-hidden and inert state", () => {
  const before = new FakeElement({
    "aria-hidden": "false",
    inert: "",
  });
  const root = new FakeElement();
  const parent = { children: [before, root] };

  before.parentElement = parent;
  root.parentElement = parent;

  const restore = applyFloatingAiModalIsolation(root);
  restore();
  restore();

  assert.equal(before.getAttribute("aria-hidden"), "false");
  assert.equal(before.getAttribute("inert"), "");
});

test("applyFloatingAiModalAccessibility traps focus within the dialog and restores prior focus on cleanup", () => {
  const documentObject = new FakeDocument();
  const before = new FakeElement();
  const root = new FakeElement();
  const after = new FakeElement();
  const parent = { children: [before, root, after] };
  const previousFocus = new FakeFocusableElement(documentObject);
  const dialog = new FakeDialogElement(documentObject, { tabindex: "-1" });
  const firstButton = new FakeFocusableElement(documentObject);
  const secondButton = new FakeFocusableElement(documentObject);

  before.parentElement = parent;
  root.parentElement = parent;
  after.parentElement = parent;
  dialog.registerFocusableElements([firstButton, secondButton]);
  documentObject.activeElement = previousFocus;

  const restore = applyFloatingAiModalAccessibility({
    rootElement: root,
    dialogElement: dialog,
    documentObject,
  });

  assert.equal(documentObject.activeElement, firstButton);

  let prevented = false;
  secondButton.focus();
  documentObject.dispatch("keydown", {
    key: "Tab",
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(documentObject.activeElement, firstButton);

  prevented = false;
  firstButton.focus();
  documentObject.dispatch("keydown", {
    key: "Tab",
    shiftKey: true,
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(documentObject.activeElement, secondButton);

  documentObject.activeElement = previousFocus;
  documentObject.dispatch("focusin");
  assert.equal(documentObject.activeElement, firstButton);

  restore();

  assert.equal(documentObject.activeElement, previousFocus);
});
