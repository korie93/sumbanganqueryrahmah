import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BillingPrincipalClientResultTable,
  billingPrincipalWorkspaceLockMessage,
  protectBillingPrivateDraftOnUnload,
} from "./BillingPrincipalSavedTargetWorkspace";
import { BillingPrincipalSavedTargetDialog } from "./BillingPrincipalSavedTargetDialog";
import { BillingPrincipalSavedTargetShell } from "./BillingPrincipalSavedTargetShell";
import { createBillingPrincipalVisualExportFixture } from "./billing-principal-v7-test-fixture";

test("Billing page exposes its real root while initial target loading is not ready", () => {
  const markup = renderToStaticMarkup(createElement(BillingPrincipalSavedTargetShell, { role: "superuser" }));
  assert.match(markup, /data-testid="billing-principal-page" data-state="loading"/);
  assert.match(markup, /Loading saved targets/);
  assert.doesNotMatch(markup, /data-state="(?:empty|populated)"/);
});

test("private draft, save and export each prevent destructive workspace transitions with distinct guidance", () => {
  assert.equal(billingPrincipalWorkspaceLockMessage({ dirty: false, saving: false, exporting: false }), "");
  assert.match(billingPrincipalWorkspaceLockMessage({ dirty: true, saving: false, exporting: false }), /Save or discard.*switching, reloading, or changing targets/);
  assert.match(billingPrincipalWorkspaceLockMessage({ dirty: true, saving: true, exporting: false }), /^Saving/);
  assert.match(billingPrincipalWorkspaceLockMessage({ dirty: false, saving: false, exporting: true }), /^Exporting/);
});

test("dirty-draft unload warning uses a native empty prompt and removes its listener on cleanup", () => {
  const target = new EventTarget();
  const cleanup = protectBillingPrivateDraftOnUnload(target);
  const event = new Event("beforeunload", { cancelable: true });
  Object.defineProperty(event, "returnValue", { value: "untouched", writable: true });
  assert.equal(target.dispatchEvent(event), false);
  assert.equal(event.defaultPrevented, true);
  assert.equal((event as BeforeUnloadEvent).returnValue, "");
  cleanup();
  const cleanEvent = new Event("beforeunload", { cancelable: true });
  assert.equal(target.dispatchEvent(cleanEvent), true);
  assert.equal(cleanEvent.defaultPrevented, false);
});

function clientTableMarkup(saving: boolean, exporting: boolean) {
  const fixture = createBillingPrincipalVisualExportFixture();
  return renderToStaticMarkup(createElement(BillingPrincipalClientResultTable, {
    target: fixture.overview.target,
    overview: { ok: true, ...fixture.overview },
    editable: true,
    saving,
    exporting,
    onSave: async () => {},
    onDirtyChange: () => {},
  }));
}

test("export disables private mutation without falsely displaying Saving", () => {
  const markup = clientTableMarkup(false, true);
  assert.match(markup, /Save Client Result/);
  assert.doesNotMatch(markup, /Saving/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>/);
  assert.match(markup, /<input[^>]*aria-label="D3 private target percentage"[^>]*disabled=""/);
  assert.match(markup, /<input[^>]*aria-label="D3 client result percentage"[^>]*disabled=""/);
});

test("actual private save displays Saving and holds percentage inputs disabled", () => {
  const markup = clientTableMarkup(true, false);
  assert.match(markup, /Saving/);
  assert.match(markup, /<input[^>]*aria-label="D3 private target percentage"[^>]*disabled=""/);
});

test("shared create and edit triggers honor the workspace lock", () => {
  const fixture = createBillingPrincipalVisualExportFixture();
  for (const target of [undefined, fixture.overview.target]) {
    const markup = renderToStaticMarkup(createElement(BillingPrincipalSavedTargetDialog, {
      ...(target ? { target } : {}),
      disabled: true,
      onSaved: () => {},
    }));
    assert.match(markup, /<button[^>]*disabled=""/);
    assert.match(markup, target ? /Edit Target/ : /Create Target/);
  }
});
