import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingPrincipalInsights } from "./BillingPrincipalInsights";
import { BillingPrincipalClientResultTable } from "./BillingPrincipalSavedTargetWorkspace";
import { createBillingPrincipalVisualExportFixture } from "./billing-principal-v7-test-fixture";

function insightsMarkup({ verified = false, disabledReason = "" } = {}) {
  const { overview } = createBillingPrincipalVisualExportFixture();
  if (verified) {
    overview.target.activeRevision.reportingWindow = {
      from: "2026-08-12", to: "2026-10-11", version: "current-validity", sourceValidityVerified: true,
      sources: [{ sourceImportId: "source-internal-id", validFrom: "2026-08-12", validTo: "2026-10-11", configured: true }],
    };
  }
  return renderToStaticMarkup(createElement(BillingPrincipalInsights, {
    target: overview.target, overview: { ok: true, ...overview },
    disabled: Boolean(disabledReason), disabledReason,
    onAccessLost: () => {}, onExportBusy: () => {},
  }));
}

function exportButtons(html: string) {
  return (html.match(/<button\b[^>]*>/g) ?? []).filter((button) => button.includes('aria-label="Export Billing Principal report as '));
}

test("Billing export describes the full current source validity and snapshot beside every format", () => {
  const html = insightsMarkup({ verified: true });
  const scope = html.match(/<p id="billing-export-scope"[^>]*>(.*?)<\/p>/)?.[1] ?? "";
  assert.match(scope, /full source validity 2026-08-12 — 2026-10-11/);
  assert.match(scope, /Table A as of 2026-09-20/);
  assert.match(scope, /Month and Cumulative aging controls do not limit exports/);
  assert.match(scope, /saved shared values and only your saved private results/);
  assert.doesNotMatch(scope, /legacy source fallback/);
  assert.equal((html.match(/id="billing-export-scope"/g) ?? []).length, 1);
  const buttons = exportButtons(html);
  assert.equal(buttons.length, 3);
  for (const button of buttons) {
    assert.match(button, /aria-describedby="billing-export-scope"/);
    assert.doesNotMatch(button, /disabled=""/);
  }
  assert.doesNotMatch(html, /id="billing-export-disabled-reason"/);
});

test("Billing export calls legacy fallback a reporting period without claiming verified source validity", () => {
  const scope = insightsMarkup().match(/<p id="billing-export-scope"[^>]*>(.*?)<\/p>/)?.[1] ?? "";
  assert.match(scope, /full reporting period \(includes legacy source fallback\) 2026-09-01 — 2026-09-30/);
  assert.doesNotMatch(scope, /full source validity/);
});

test("Billing export associates the current save or draft lock with all disabled formats", () => {
  for (const reason of [
    "Save or discard your private Client Result changes before exporting.",
    "Saving your private Client Result. Wait before exporting.",
  ]) {
    const html = insightsMarkup({ disabledReason: reason });
    assert.ok(html.includes(`<p id="billing-export-disabled-reason" role="status" class="break-words text-xs text-muted-foreground">${reason}</p>`));
    for (const button of exportButtons(html)) {
      assert.match(button, /disabled=""/);
      assert.match(button, /aria-describedby="billing-export-scope billing-export-disabled-reason"/);
    }
  }
});

function clientMarkup({ submitted = true, editable = true, saving = false, exporting = false } = {}) {
  const { overview } = createBillingPrincipalVisualExportFixture();
  if (!submitted) overview.clientResult.all.receivedDate = null;
  return renderToStaticMarkup(createElement(BillingPrincipalClientResultTable, {
    target: overview.target, overview: { ok: true, ...overview },
    editable, saving, exporting, onSave: async () => {}, onDirtyChange: () => {},
  }));
}

test("private Save explains unchanged saved results while keeping initial defaults saveable", () => {
  const saved = clientMarkup();
  assert.match(saved, /<button[^>]*disabled=""[^>]*aria-describedby="billing-client-save-disabled-reason"/);
  assert.match(saved, /id="billing-client-save-disabled-reason"[^>]*>No unsaved changes to save\.<\/p>/);
  const initial = clientMarkup({ submitted: false });
  assert.match(initial, /Save Client Result/);
  assert.doesNotMatch(initial, /<button[^>]*disabled=""|billing-client-save-disabled-reason/);
});

test("private Save explains operation locks without exposing a Save action to read-only users", () => {
  for (const [state, message] of [
    [{ saving: true }, "Saving your private Client Result. Please wait."],
    [{ exporting: true }, "Wait for the report export to finish or cancel it before saving."],
  ] as const) {
    const html = clientMarkup(state);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="billing-client-save-disabled-reason"/);
    assert.ok(html.includes(message));
    assert.doesNotMatch(html, /No unsaved changes to save/);
  }
  const readOnly = clientMarkup({ editable: false });
  assert.doesNotMatch(readOnly, /Save Client Result|billing-client-save-disabled-reason/);
});
