import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createManagedAccountDialogFocusHandoff } from "./managed-account-dialog-focus";

test("Details -> Edit hands back the original list opener exactly once", () => {
  const handoff = createManagedAccountDialogFocusHandoff();
  const listOpener = { id: "details-opener" } as HTMLElement;
  handoff.setForDialog("account-1", "edit", listOpener);
  assert.equal(handoff.takeForDialog("account-1", "edit"), listOpener);
  assert.equal(handoff.takeForDialog("account-1", "edit"), null);
});

test("an unrelated editor cannot consume a stale account opener", () => {
  const handoff = createManagedAccountDialogFocusHandoff();
  handoff.setForDialog("account-1", "edit", {} as HTMLElement);
  assert.equal(handoff.takeForDialog("account-2", "edit"), null);
  assert.equal(handoff.takeForDialog("account-1", "edit"), null);
});

test("missing opener clears the previous handoff and direct Edit uses its own focus target", () => {
  const handoff = createManagedAccountDialogFocusHandoff();
  handoff.setForDialog("account-1", "edit", {} as HTMLElement);
  handoff.setForDialog("account-2", "edit", null);
  assert.equal(handoff.takeForDialog("account-1", "edit"), null);
  assert.equal(handoff.takeForDialog(undefined, "edit"), null);
});

test("reset, ban and delete dialogs each receive the Details opener without crossing action kinds", () => {
  const handoff = createManagedAccountDialogFocusHandoff();
  const listOpener = {} as HTMLElement;
  for (const kind of ["reset", "ban", "delete"] as const) {
    handoff.setForDialog("account-1", kind, listOpener);
    assert.equal(handoff.takeForDialog("account-1", kind), listOpener);
  }
  handoff.setForDialog("account-1", "delete", listOpener);
  assert.equal(handoff.takeForDialog("account-1", "reset"), null);
});

test("confirmation contents consume the matching opener while leaving native cancel autofocus and guards intact", () => {
  const actions = readFileSync(new URL("ManagedAccountActionDialogs.tsx", import.meta.url), "utf8");
  assert.match(actions, /takeForDialog\(resetPasswordUser\?\.id, "reset"\)/);
  assert.match(actions, /takeForDialog\(banToggleUser\?\.id, "ban"\)/);
  assert.equal((actions.match(/onCloseAutoFocus=/g) || []).length, 2);
  assert.match(actions, /onConfirmResetPassword\(resetPasswordUser\)/);
  assert.match(actions, /onConfirmBanToggle\(banToggleUser\)/);
  const deletion = readFileSync(new URL("DeleteManagedAccountDialog.tsx", import.meta.url), "utf8");
  assert.match(deletion, /takeForDialog\(user\?\.id, "delete"\)/);
  assert.match(deletion, /disabled=\{Boolean\(deletingManagedUserId\) \|\| !user\}/);
  assert.match(deletion, /onDeleteUser\(user\)/);
});
