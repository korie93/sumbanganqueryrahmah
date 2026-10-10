import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createCollectionRecordOverlayFocus } from "../collection-record-overlay-focus";

function focusTarget() {
  const calls: FocusOptions[] = [];
  return {
    isConnected: true,
    disabled: false,
    focus(options: FocusOptions = {}) { calls.push(options); },
    calls,
  };
}

function closeEvent() {
  let prevented = false;
  return {
    preventDefault() { prevented = true; },
    get prevented() { return prevented; },
  };
}

test("collection edit close restores the real launcher without scrolling", () => {
  const origin = focusTarget();
  const fallback = focusTarget();
  const focus = createCollectionRecordOverlayFocus(() => fallback);
  const event = closeEvent();
  focus.remember("edit", origin);
  focus.restore("edit", event);
  assert.equal(event.prevented, true);
  assert.deepEqual(origin.calls, [{ preventScroll: true }]);
  assert.deepEqual(fallback.calls, []);
});

test("receipt closes back to its launcher without scrolling or consuming the parent edit origin", () => {
  const row = focusTarget();
  const nestedReceiptButton = focusTarget();
  const fallback = focusTarget();
  const focus = createCollectionRecordOverlayFocus(() => fallback);
  focus.remember("edit", row);
  focus.remember("receipt", nestedReceiptButton);
  focus.restore("receipt", closeEvent());
  assert.deepEqual(nestedReceiptButton.calls, [{ preventScroll: true }]);
  assert.deepEqual(row.calls, []);
  focus.restore("edit", closeEvent());
  assert.deepEqual(row.calls, [{ preventScroll: true }]);
  assert.deepEqual(fallback.calls, []);
});

test("edit and delete own separate launchers and consume each origin on close", () => {
  const edit = focusTarget();
  const deletion = focusTarget();
  const fallback = focusTarget();
  const focus = createCollectionRecordOverlayFocus(() => fallback);
  focus.remember("edit", edit);
  focus.remember("delete", deletion);
  focus.restore("delete", closeEvent());
  focus.restore("edit", closeEvent());
  focus.restore("edit", closeEvent());
  assert.equal(edit.calls.length, 1);
  assert.equal(deletion.calls.length, 1);
  assert.equal(fallback.calls.length, 1);
});

test("removed or disabled collection launchers fall back to a connected page control", () => {
  for (const unavailable of ["removed", "disabled"] as const) {
    const origin = focusTarget();
    const fallback = focusTarget();
    const focus = createCollectionRecordOverlayFocus(() => fallback);
    focus.remember("delete", origin);
    if (unavailable === "removed") origin.isConnected = false;
    else origin.disabled = true;
    focus.restore("delete", closeEvent());
    assert.deepEqual(origin.calls, []);
    assert.deepEqual(fallback.calls, [{ preventScroll: true }]);
  }
});

test("confirmed async deletion clears the launcher before it can disappear after close", () => {
  const origin = focusTarget();
  const fallback = focusTarget();
  const focus = createCollectionRecordOverlayFocus(() => fallback);
  focus.remember("delete", origin);
  focus.remember("delete", null);
  focus.restore("delete", closeEvent());
  assert.deepEqual(origin.calls, []);
  assert.equal(fallback.calls.length, 1);
});

test("a detached new launcher cannot retain a stale previous origin", () => {
  const oldOrigin = focusTarget();
  const detached = { ...focusTarget(), isConnected: false };
  const fallback = focusTarget();
  const focus = createCollectionRecordOverlayFocus(() => fallback);
  focus.remember("edit", oldOrigin);
  focus.remember("edit", detached);
  focus.restore("edit", closeEvent());
  assert.deepEqual(oldOrigin.calls, []);
  assert.deepEqual(detached.calls, []);
  assert.equal(fallback.calls.length, 1);
});

test("unmounted or disabled fallback targets are not focused", () => {
  for (const fallback of [null, { ...focusTarget(), isConnected: false }, { ...focusTarget(), disabled: true }]) {
    const focus = createCollectionRecordOverlayFocus(() => fallback);
    const event = closeEvent();
    focus.restore("delete", event);
    assert.equal(event.prevented, true);
    if (fallback) assert.deepEqual(fallback.calls, []);
  }
});

test("mobile menu only suppresses close restoration when handing focus to an overlay", () => {
  const source = readFileSync(path.resolve("client/src/pages/collection-records/CollectionRecordActions.tsx"), "utf8");
  assert.match(source, /<DropdownMenu modal=\{false\}>/);
  assert.doesNotMatch(source, /document\.body|pointerEvents|setTimeout/);
  assert.match(source, /ref=\{triggerRef\}/);
  assert.match(source, /handingOffFocus\.current = true;\s*action\(record, triggerRef\.current \?\? undefined\)/);
  assert.match(source, /if \(handingOffFocus\.current\) event\.preventDefault\(\);\s*handingOffFocus\.current = false/);
  assert.match(source, /canEdit \? \([\s\S]*onSelect=\{\(\) => openOverlay\(onEdit\)\}/);
  assert.match(source, /canDelete \? \([\s\S]*onSelect=\{\(\) => openOverlay\(onDelete\)\}/);
});

test("desktop shares the launcher-aware menu and both lazy dialogs restore focus", () => {
  const directory = path.resolve("client/src/pages/collection-records");
  const desktop = readFileSync(path.join(directory, "CollectionRecordsDesktopTable.tsx"), "utf8");
  const page = readFileSync(path.resolve("client/src/pages/collection/CollectionRecordsPage.tsx"), "utf8");
  assert.match(desktop, /<CollectionRecordActions/);
  assert.match(desktop, /onEdit=\{onEdit\}/);
  assert.match(desktop, /onDelete=\{onDelete\}/);
  assert.match(desktop, /canEdit \|\| canDeleteRow\(record\)/);
  for (const overlay of ["edit", "delete", "receipt"]) {
    assert.match(page, new RegExp(`onCloseAutoFocus=\\{\\(event\\) => overlayFocus\\.restore\\("${overlay}", event\\)\\}`));
  }
  assert.match(page, /overlayFocus\.remember\("delete", null\);\s*viewModel\.deleteDialog\.onConfirm\(\)/);
  for (const file of ["EditCollectionRecordDialog.tsx", "DeleteCollectionRecordDialog.tsx", "ReceiptPreviewDialog.tsx"]) {
    assert.match(readFileSync(path.join(directory, file), "utf8"), /onCloseAutoFocus=\{onCloseAutoFocus\}/);
  }
});

test("mobile filter actions wrap by content width without clipping the label or filter count", () => {
  const page = readFileSync(path.resolve("client/src/pages/collection/CollectionRecordsPage.tsx"), "utf8");
  const start = page.indexOf('ref={mobileFiltersTriggerRef}');
  const end = page.indexOf('<section aria-label="View Rekod Collection"', start);
  const toolbar = page.slice(start, end);
  assert.match(page.slice(start - 150, start), /flex flex-wrap gap-2/);
  assert.match(toolbar, /flex-\[2_1_12rem\]/);
  assert.match(toolbar, /flex-\[1_1_6rem\]/);
  assert.match(toolbar, /shrink-0 rounded-full/);
  assert.match(toolbar, /Search & Filters/);
  assert.match(toolbar, /activeFilterChips\.length/);
  assert.match(toolbar, /onClick=\{handleMobileReset\}/);
  assert.match(toolbar, /setMobileFiltersOpen\(true\)/);
});
