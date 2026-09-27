import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSavedOverlayFocus } from "./saved-overlay-focus";

function focusTarget() {
  const calls: Array<FocusOptions | undefined> = [];
  return {
    isConnected: true,
    disabled: false,
    calls,
    focus(options?: FocusOptions) { calls.push(options); },
  };
}

function closeEvent() {
  return { prevented: false, preventDefault() { this.prevented = true; } };
}

test("Saved overlays retain separate launchers through nested delete and details close", () => {
  const menu = focusTarget();
  const drawerDelete = focusTarget();
  const fallback = focusTarget();
  const focus = createSavedOverlayFocus(() => fallback);
  focus.remember("details", menu);
  focus.remember("delete", drawerDelete);

  const deleteClose = closeEvent();
  focus.restore("delete", deleteClose);
  assert.equal(deleteClose.prevented, true);
  assert.deepEqual(drawerDelete.calls, [{ preventScroll: true }]);
  assert.equal(menu.calls.length, 0);

  focus.restore("details", closeEvent());
  assert.deepEqual(menu.calls, [{ preventScroll: true }]);
  assert.equal(fallback.calls.length, 0);
});

test("Saved overlay closure restores a stable fallback when deletion removes its launcher", () => {
  const removed = focusTarget();
  const search = focusTarget();
  const focus = createSavedOverlayFocus(() => search);
  focus.remember("delete", removed);
  removed.isConnected = false;
  focus.restore("delete", closeEvent());
  assert.equal(removed.calls.length, 0);
  assert.deepEqual(search.calls, [{ preventScroll: true }]);
});

test("Saved focus ignores disabled or disconnected controls and clears stale origins", () => {
  const button = focusTarget();
  const fallback = focusTarget();
  const focus = createSavedOverlayFocus(() => fallback);
  focus.remember("rename", button);
  button.disabled = true;
  focus.restore("rename", closeEvent());
  assert.equal(button.calls.length, 0);
  assert.equal(fallback.calls.length, 1);
  focus.remember("details", button);
  focus.remember("details", null);
  button.disabled = false;
  fallback.isConnected = false;
  focus.restore("details", closeEvent());
  assert.equal(button.calls.length, 0);
  assert.equal(fallback.calls.length, 1);
});

test("Saved menu handoffs and overlay closures wire their explicit focus origins", () => {
  const actions = readFileSync(new URL("./SavedImportActions.tsx", import.meta.url), "utf8");
  const dialogs = readFileSync(new URL("./SavedDialogs.tsx", import.meta.url), "utf8");
  const drawer = readFileSync(new URL("./SavedImportDetailDrawer.tsx", import.meta.url), "utf8");
  assert.match(actions, /overlayFocus\?\.remember\(overlay, triggerRef\.current\)/);
  assert.match(actions, /if \(handingOffFocus\.current\) event\.preventDefault\(\)/);
  for (const overlay of ["rename", "delete", "bulk-delete"]) {
    assert.ok(dialogs.includes(`overlayFocus?.restore("${overlay}", event)`));
  }
  assert.match(drawer, /overlayFocus\?\.restore\("details", event\)/);
  assert.match(drawer, /overlayFocus\?\.remember\("delete", event\.currentTarget\)/);
});
