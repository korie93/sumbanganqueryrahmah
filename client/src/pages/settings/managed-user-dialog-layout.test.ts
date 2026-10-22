import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Radix portals are not emitted by renderToStaticMarkup. Keep these narrowly
// scoped source contracts alongside browser geometry, keyboard and API tests.
const source = readFileSync(new URL("./ManagedUserDialog.tsx", import.meta.url), "utf8");
const inputSource = readFileSync(new URL("../../components/ui/input.tsx", import.meta.url), "utf8");
const fields = ["full-name", "username", "email", "role", "status", "banned"];

function controlSource(field: string) {
  const idPosition = source.indexOf(`id="managed-user-${field}"`);
  assert.ok(idPosition >= 0, `Keep the existing ${field} control ID`);
  const inputStart = source.lastIndexOf("<Input", idPosition);
  const selectStart = source.lastIndexOf("<select", idPosition);
  const start = Math.max(inputStart, selectStart);
  const end = start === inputStart ? source.indexOf("/>", idPosition) + 2 : source.indexOf("</select>", idPosition) + 9;
  return source.slice(start, end);
}

test("managed account editor keeps all six controls locally 44px with bounded responsive typography", () => {
  for (const field of fields) {
    const control = controlSource(field);
    assert.match(control, /className="[^"]*\bh-11\b/, field);
    assert.match(control, /className="[^"]*\bmin-w-0\b/, field);
    // The three shared Inputs intentionally inherit their existing responsive
    // text sizes; native selects specify the same sizes locally.
    assert.match(control.startsWith("<Input") ? inputSource : control, /\btext-base\b[^"\n]*\bmd:text-sm\b/, field);
    assert.match(control, /disabled=\{managedSaving\}/, field);
    assert.doesNotMatch(control, /\bh-10\b/, field);
  }
});

test("managed account editor uses six block labels and minimum-width-safe 8px field stacks", () => {
  for (const field of fields) {
    const label = source.match(new RegExp(`<label\\b[^>]*htmlFor="managed-user-${field}"[^>]*>`))?.[0];
    assert.ok(label, `Keep the explicit ${field} label association`);
    assert.match(label, /className="[^"]*\bblock\b/, field);
    const position = source.indexOf(label);
    const wrapper = source.slice(source.lastIndexOf("<div", position), position);
    assert.match(wrapper, /className="[^"]*\bmin-w-0\b/, field);
    assert.match(wrapper, /className="[^"]*\bspace-y-2\b/, field);
  }
});

test("managed account editor keeps bounded internal scrolling and locally sized footer and Close targets", () => {
  assert.match(source, /<DialogContent className="[^"]*\bmin-w-0\b[^"\n]*overflow-hidden/);
  assert.match(source, /\[&>button\]:min-h-11/);
  assert.match(source, /\[&>button\]:min-w-11/);
  assert.match(source, /min-h-0[^"\n]*overflow-y-auto/);
  assert.match(source, /<\/div>\s*<DialogFooter className="shrink-0/);
  for (const callback of ["onCloseManagedDialog", "onConfirmManagedSave"]) {
    const button = source.match(new RegExp(`<Button\\b[^>]*onClick=\\{${callback}\\}[^>]*>`))?.[0];
    assert.ok(button, callback);
    assert.match(button, /className="[^"]*\bmin-h-11\b/, callback);
    assert.match(button, callback === "onConfirmManagedSave"
      ? /disabled=\{managedSaving \|\| !editState\.canSave\}/
      : /disabled=\{managedSaving\}/, callback);
  }
  assert.match(source, /<div className="flex justify-end gap-2">\s*<Button variant="outline"/);
});

test("managed account editor exposes inline identity errors and reuses shared save readiness in its mutation hook", () => {
  for (const field of ["username", "email"]) {
    const control = controlSource(field);
    assert.match(control, new RegExp(`\\{\\.\\.\\.getAriaInvalidProps\\(Boolean\\(editState\\.errors\\.${field}\\)\\)\\}`));
    assert.doesNotMatch(control, /aria-invalid=\{/);
    assert.match(control, new RegExp(`aria-describedby=\\{editState\\.errors\\.${field} \\? "managed-user-${field}-error" : undefined\\}`));
    assert.match(source, new RegExp(`id="managed-user-${field}-error"`));
  }
  assert.match(source, /id="managed-user-save-feedback"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(source, /aria-describedby=\{managedSaveError && !managedSaving \? "managed-user-save-error-details" : "managed-user-save-feedback"\}/);
  const hook = readFileSync(new URL("./useSettingsManagedUserUpdate.ts", import.meta.url), "utf8");
  assert.match(source, /getManagedUserEditState\(managedSelectedUser,/);
  assert.match(hook, /getManagedUserEditState\(managedSelectedUser,/);
  assert.match(hook, /if \(!editState\.canSave\)/);
  assert.match(hook, /const payload = editState\.profilePayload/);
  assert.match(hook, /if \(editState\.roleChanged\)/);
  assert.match(hook, /if \(editState\.statusChanged\)/);
});

test("managed account server feedback is one named focusable bounded inline alert without HTML rendering", () => {
  assert.match(source, /managedSaveError && !managedSaving \? \(/);
  const alert = source.match(/<div id="managed-user-save-error"[^>]*>/)?.[0];
  assert.ok(alert);
  assert.match(alert, /role="alert"/);
  assert.match(alert, /aria-label="Account update error"/);
  assert.match(alert, /tabIndex=\{0\}/);
  assert.match(alert, /max-h-\[min\(10rem,25dvh\)\]/);
  assert.match(alert, /min-w-0[^"\n]*overflow-y-auto/);
  assert.match(alert, /focus-visible:ring-2/);
  assert.match(alert, /focus-visible:ring-inset/);
  assert.match(source, /id="managed-user-save-error-details"/);
  assert.match(source, /<p>\{managedSaveError\.message\}<\/p>/);
  assert.match(source, /Reference: \{managedSaveError\.requestId\}/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML=/);
});

test("managed account inline failures restore lost Save focus without stealing another control's focus", () => {
  assert.match(source, /const saveButtonRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(source, /ref=\{saveButtonRef\}/);
  assert.match(source, /managedDialogOpen && managedSaveError && !managedSaving && document\.activeElement === document\.body/);
  assert.match(source, /saveButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});

test("managed account editor sessions synchronously isolate late failure and success from reopened dialogs", () => {
  const dialogs = readFileSync(new URL("./useSettingsManagedDialogs.ts", import.meta.url), "utf8");
  const hook = readFileSync(new URL("./useSettingsManagedUserUpdate.ts", import.meta.url), "utf8");
  assert.match(dialogs, /const editorSessionRef = useRef\(0\)/);
  assert.equal((dialogs.match(/editorSessionRef\.current \+= 1/g) ?? []).length, 2);
  assert.match(dialogs, /if \(editorSessionRef\.current !== session\) return false/);
  assert.match(dialogs, /openManagedEditor = useCallback\(\(user: ManagedUser\) => \{\s+editorSessionRef\.current \+= 1;\s+setManagedSaveError\(null\)/);
  assert.match(dialogs, /handleManagedDialogChange = useCallback\(\(open: boolean\) => \{\s+editorSessionRef\.current \+= 1;\s+setManagedSaveError\(null\)/);
  assert.match(hook, /const editorSession = managedEditorFeedback\.sessionRef\.current/);
  assert.match(hook, /managedEditorFeedback\.publishError\(editorSession, null\)/);
  assert.match(hook, /if \(managedEditorFeedback\.sessionRef\.current === editorSession\) \{\s+onManagedDialogOpenChange\(false\)/);
  assert.match(hook, /const published = managedEditorFeedback\.publishError\(editorSession,/);
  assert.match(hook, /if \(!published\) toast\(\{ \.\.\.feedback, description: `\$\{managedSelectedUser\.username\}: \$\{feedback\.description\}` \}\)/);
});

test("managed account editor preserves focus handoff, controlled callbacks and non-form save behavior", () => {
  assert.match(source, /onOpenChange=\{onManagedDialogOpenChange\}/);
  assert.match(source, /takeForDialog\(managedSelectedUser\?\.id, "edit"\)/);
  assert.match(source, /fullNameInputRef\.current\?\.focus\(\)/);
  assert.match(source, /returnFocusRef\.current\.focus\(\{ preventScroll: true \}\)/);
  for (const callback of ["onManagedFullNameInputChange", "onManagedUsernameInputChange", "onManagedEmailInputChange", "onManagedRoleInputChange", "onManagedStatusInputChange", "onManagedIsBannedChange"]) {
    assert.match(source, new RegExp(`${callback}\\(`));
  }
  assert.match(source, /await onSaveCriticalSettings\(\)/);
  assert.doesNotMatch(source, /<form\b|onSubmit=|onEscapeKeyDown=|onInteractOutside=/);
});
