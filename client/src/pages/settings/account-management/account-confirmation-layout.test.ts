import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// AlertDialog portals are verified with actual browser geometry and keyboard
// tests. These source checks keep local styling and original callbacks bounded.
const actions = readFileSync(new URL("./ManagedAccountActionDialogs.tsx", import.meta.url), "utf8");
const deletion = readFileSync(new URL("./DeleteManagedAccountDialog.tsx", import.meta.url), "utf8");

test("managed account confirmations bound the dialog and scroll only the content above fixed actions", () => {
  for (const [source, count] of [[actions, 2], [deletion, 1]] as const) {
    const contents = source.match(/<AlertDialogContent\b[^>]*className="[^"]*"/g) ?? [];
    assert.equal(contents.length, count);
    for (const content of contents) {
      assert.match(content, /className="[^"]*\bflex\b/);
      assert.match(content, /\bmin-w-0\b/);
      assert.match(content, /\bflex-col\b/);
      assert.match(content, /\boverflow-hidden\b/);
    }
    assert.equal((source.match(/min-h-0[^"\n]*min-w-0[^"\n]*overflow-y-auto/g) ?? []).length, count);
    assert.equal((source.match(/<\/div>\s*<AlertDialogFooter className="[^"]*shrink-0/g) ?? []).length, count);
    assert.equal((source.match(/role="region"/g) ?? []).length, count);
    assert.equal((source.match(/tabIndex=\{0\}/g) ?? []).length, count);
    assert.equal((source.match(/focus-visible:ring-2/g) ?? []).length, count);
    assert.equal((source.match(/focus-visible:ring-inset/g) ?? []).length, count);
  }
  assert.match(actions, /aria-label="Password reset action details"/);
  assert.match(actions, /aria-label=\{`\$\{nextBanAction\} account action details`\}/);
  assert.match(deletion, /aria-label="Delete account action details"/);
});

test("managed account confirmation labels wrap and retain left-aligned semantic headings and impact lists", () => {
  for (const [source, count] of [[actions, 2], [deletion, 1]] as const) {
    assert.equal((source.match(/<AlertDialogHeader className="[^"]*text-left/g) ?? []).length, count);
    assert.equal((source.match(/<AlertDialogDescription className="[^"]*break-words/g) ?? []).length, count);
    // overflow-wrap is inherited by the inline username from Description;
    // browser geometry verifies the complete 32-character rendered name.
    const usernames = source.match(/<span className="[^"]*font-medium[^"]*"/g) ?? [];
    assert.equal(usernames.length, count);
    assert.equal((source.match(/<AlertDialogTitle\b/g) ?? []).length, count);
    assert.equal((source.match(/<ManagedAccountActionImpactList items=/g) ?? []).length, count);
  }
});

test("managed account confirmation actions stay locally 44px with an 8px mobile footer gap", () => {
  for (const [source, count] of [[actions, 2], [deletion, 1]] as const) {
    assert.equal((source.match(/<AlertDialogFooter className="[^"]*\bgap-2\b/g) ?? []).length, count);
    const cancels = source.match(/<AlertDialogCancel\b[^>]*>/g) ?? [];
    const confirms = source.match(/<AlertDialogAction\b[^>]*>/g) ?? [];
    assert.equal(cancels.length, count);
    assert.equal(confirms.length, count);
    for (const button of [...cancels, ...confirms]) {
      assert.match(button, /className="[^"]*\bmin-h-11\b/);
      assert.match(button, /\bsm:min-h-11\b/);
    }
    for (const cancel of cancels) assert.match(cancel, /\bmt-0\b/);
  }
});

test("managed account confirmation styles retain native Cancel autofocus, focus handoff and existing guards", () => {
  assert.match(actions, /takeForDialog\(resetPasswordUser\?\.id, "reset"\)/);
  assert.match(actions, /takeForDialog\(banToggleUser\?\.id, "ban"\)/);
  assert.match(deletion, /takeForDialog\(user\?\.id, "delete"\)/);
  assert.equal((actions.match(/onCloseAutoFocus=/g) ?? []).length, 2);
  assert.equal((deletion.match(/onCloseAutoFocus=/g) ?? []).length, 1);
  assert.match(actions, /disabled=\{!resetPasswordUser\}/);
  assert.match(actions, /disabled=\{!banToggleUser\}/);
  assert.match(actions, /onConfirmResetPassword\(resetPasswordUser\)/);
  assert.match(actions, /onConfirmBanToggle\(banToggleUser\)/);
  assert.match(deletion, /disabled=\{Boolean\(deletingManagedUserId\) \|\| !user\}/);
  assert.match(deletion, /onDeleteUser\(user\)/);
  for (const source of [actions, deletion]) {
    assert.doesNotMatch(source, /onEscapeKeyDown=|onPointerDownOutside=|onInteractOutside=|onSubmit=|<form\b/);
    assert.doesNotMatch(source, /onOpenAutoFocus=\{\(event\)/);
  }
});
