import assert from "node:assert/strict";
import test from "node:test";
import { isEditableShortcutTarget, matchesPageShortcut } from "@/hooks/usePageShortcuts";

test("isEditableShortcutTarget detects standard form controls and contenteditable containers", () => {
  assert.equal(isEditableShortcutTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableShortcutTarget({ tagName: "textarea" }), true);
  assert.equal(isEditableShortcutTarget({ tagName: "div", isContentEditable: true }), true);
  assert.equal(
    isEditableShortcutTarget({
      tagName: "div",
      closest: (selector: string) => (selector.includes("contenteditable") ? {} : null),
    }),
    true,
  );
  assert.equal(isEditableShortcutTarget({ tagName: "button" }), false);
});

test("matchesPageShortcut respects ctrl/meta, alt, and shift modifiers", () => {
  assert.equal(
    matchesPageShortcut(
      { key: "s", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
      { key: "s", ctrlOrMeta: true },
    ),
    true,
  );
  assert.equal(
    matchesPageShortcut(
      { key: "/", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
      { key: "/" },
    ),
    true,
  );
  assert.equal(
    matchesPageShortcut(
      { key: "S", ctrlKey: false, metaKey: true, altKey: false, shiftKey: true },
      { key: "s", ctrlOrMeta: true, shift: true },
    ),
    true,
  );
  assert.equal(
    matchesPageShortcut(
      { key: "s", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
      { key: "s", ctrlOrMeta: true },
    ),
    false,
  );
  assert.equal(
    matchesPageShortcut(
      { key: "f", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false },
      { key: "f" },
    ),
    false,
  );
});
