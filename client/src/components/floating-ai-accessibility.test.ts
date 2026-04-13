import assert from "node:assert/strict";
import test from "node:test";
import { applyFloatingAiModalIsolation } from "@/components/floating-ai-accessibility";

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
