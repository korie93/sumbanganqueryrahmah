import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createActivityOverlayFocus } from "./activity-overlay-focus";

function target() {
  const calls: Array<FocusOptions | undefined> = [];
  return { isConnected: true, disabled: false, calls, focus(options?: FocusOptions) { calls.push(options); } };
}
function event() {
  return { prevented: false, preventDefault() { this.prevented = true; } };
}

test("activity menu cancellation restores the launcher captured before lazy dialog mounting", () => {
  const launcher = target();
  const fallback = target();
  const focus = createActivityOverlayFocus(() => fallback);
  const close = event();
  focus.remember("kick", launcher);
  focus.restore("kick", close);
  assert.equal(close.prevented, true);
  assert.deepEqual(launcher.calls, [{ preventScroll: true }]);
  assert.deepEqual(fallback.calls, []);
});

test("investigation handoff retains its original row launcher for confirmation cancellation", () => {
  for (const action of ["kick", "ban", "delete"] as const) {
    const launcher = target();
    const fallback = target();
    const focus = createActivityOverlayFocus(() => fallback);
    focus.remember("investigate", launcher);
    focus.transfer("investigate", action);
    focus.restore(action, event());
    assert.equal(launcher.calls.length, 1);
    assert.equal(fallback.calls.length, 0);
    focus.restore("investigate", event());
    assert.equal(launcher.calls.length, 1);
    assert.equal(fallback.calls.length, 1);
  }
});

test("activity dialogs never focus recycled, disabled, removed or stale origin controls", () => {
  for (const state of ["disconnected", "disabled", "cleared"] as const) {
    const launcher = target();
    const fallback = target();
    const focus = createActivityOverlayFocus(() => fallback);
    focus.remember("delete", launcher);
    if (state === "disconnected") launcher.isConnected = false;
    if (state === "disabled") launcher.disabled = true;
    if (state === "cleared") focus.remember("delete", null);
    focus.restore("delete", event());
    assert.equal(launcher.calls.length, 0);
    assert.equal(fallback.calls.length, 1);
  }
});

test("empty transfers clear old action origins and unmounted fallbacks are ignored", () => {
  const stale = target();
  const fallback = { ...target(), isConnected: false };
  const focus = createActivityOverlayFocus(() => fallback);
  focus.remember("ban", stale);
  focus.transfer("investigate", "ban");
  const close = event();
  focus.restore("ban", close);
  assert.equal(close.prevented, true);
  assert.equal(stale.calls.length, 0);
  assert.equal(fallback.calls.length, 0);
});

test("virtualized row reuse cannot return focus to a different activity's control", () => {
  let currentTestId = "button-activity-actions-first";
  const launcher = { ...target(), getAttribute: () => currentTestId };
  const fallback = target();
  const focus = createActivityOverlayFocus(() => fallback);
  focus.remember("delete", launcher);
  currentTestId = "button-activity-actions-second";
  focus.restore("delete", event());
  assert.equal(launcher.calls.length, 0);
  assert.equal(fallback.calls.length, 1);
});

test("row actions, lazy confirmations and drawer handoff share explicit focus origins", () => {
  const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
  const actions = read("./ActivityRowActions.tsx");
  const drawer = read("./ActivityInvestigationDrawer.tsx");
  const confirm = read("./ActivityConfirmationDialog.tsx");
  const page = read("./ActivityPageContent.tsx");
  assert.match(actions, /remember\(overlay, triggerRef\.current\)/);
  assert.match(actions, /remember\("investigate", event\.currentTarget\)/);
  assert.match(actions, /if \(handingOffFocus\.current\) event\.preventDefault\(\)/);
  assert.match(drawer, /transfer\("investigate", overlay\)/);
  assert.match(drawer, /if \(handingOffFocus\.current\) \{\s+event\.preventDefault\(\)/);
  assert.match(drawer, /restore\("investigate", event\)/);
  assert.match(confirm, /restore\(focusOrigin, event\)/);
  assert.match(confirm, /remember\(focusOrigin, null\);\s+onConfirm\(\)/);
  assert.match(page, /ActivityOverlayFocusContext\.Provider value=\{overlayFocus\}/);
  assert.match(page, /button-toggle-filters/);
  for (const [file, key] of [["ActivityBanDialog", "ban"], ["ActivityKickDialog", "kick"], ["ActivityDeleteDialog", "delete"]]) {
    assert.ok(read(`./${file}.tsx`).includes(`focusOrigin="${key}"`));
  }
});

test("nested related-session cancellation restores the actual button or a drawer-local fallback", () => {
  const related = readFileSync(new URL("./ActivityInvestigationRelatedSessions.tsx", import.meta.url), "utf8");
  const drawer = readFileSync(new URL("./ActivityInvestigationDrawer.tsx", import.meta.url), "utf8");
  assert.match(related, /onDeleteRequest\(session, event\.currentTarget\)/);
  assert.match(drawer, /relatedDeleteTriggerRef\.current = trigger/);
  assert.match(drawer, /onCloseAutoFocus=\{\(event\) => \{\s+event\.preventDefault\(\);\s+const trigger = relatedDeleteTriggerRef\.current/);
  assert.match(drawer, /drawerContentRef\.current\?\.querySelector/);
});
