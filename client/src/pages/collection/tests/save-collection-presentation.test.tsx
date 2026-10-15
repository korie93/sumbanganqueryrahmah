import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaveCollectionFormSection } from "../SaveCollectionFormSection";
import { SaveCollectionReadySummary } from "../SaveCollectionReadySummary";
import { getSaveCollectionReadiness, type SaveCollectionFormValues } from "../save-collection-page-utils";

const values: SaveCollectionFormValues = {
  staffNickname: "Fixture Collector", customerName: "Synthetic Customer",
  icNumber: "900101010101", customerPhone: "0123456789", accountNumber: "000123456789",
  cardNumber: "00009007199254740993", batch: "P10", paymentDate: "2026-09-21", amount: "100.00",
};

test("collection form groups use semantic headings and scoped reference card boundaries", () => {
  const markup = renderToStaticMarkup(createElement(SaveCollectionFormSection, {
    title: "Customer Details", description: "Match the existing saved source.",
    children: createElement("input", { "aria-label": "Customer Name" }),
  }));
  assert.match(markup, /<section/);
  assert.match(markup, /class="save-collection-section"/);
  assert.match(markup, /class="save-collection-section-header"/);
  assert.match(markup, />Customer Details<\/h3>/);
  assert.match(markup, /aria-label="Customer Name"/);
  assert.doesNotMatch(markup, /shadow|bg-gradient/);
  const page = readFileSync(new URL("../SaveCollectionPage.tsx", import.meta.url), "utf8");
  assert.match(page, /<section aria-labelledby="save-collection-form-title"/);
  assert.match(page, /<fieldset disabled=\{accessSuspended\}/);
  assert.match(page, /className="save-collection-submit-workspace static"/);
  assert.doesNotMatch(page, /sticky bottom-0|useMobileKeyboardState/);
  assert.match(page, /data-floating-ai-avoid="true"/);
  assert.doesNotMatch(page, /bg-gradient|backdrop|<Card|cleaner mobile flow/);
});

test("section actions stay beside the semantic heading without duplicating the control in content", () => {
  const markup = renderToStaticMarkup(createElement(SaveCollectionFormSection, {
    title: "Receipt Upload", description: "Review the synthetic receipt.",
    actions: createElement("button", { type: "button", disabled: true }, "Clear Pending"),
    children: createElement("input", { type: "file", "aria-label": "Upload Receipt" }),
  }));
  const header = markup.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
  assert.ok(header);
  assert.match(header, />Receipt Upload<\/h3>/);
  assert.match(header, /<button\b[^>]*type="button"[^>]*disabled=""[^>]*>Clear Pending<\/button>/);
  assert.equal((markup.match(/>Clear Pending<\/button>/g) || []).length, 1);
  assert.match(markup.slice(markup.indexOf("</header>")), /aria-label="Upload Receipt"/);
  assert.doesNotMatch(markup.slice(markup.indexOf("</header>")), /Clear Pending/);
});

test("reference entry presentation preserves account grouping, responsive sizing and full-width receipt review", () => {
  const page = readFileSync(new URL("../SaveCollectionPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../SaveCollectionPage.css", import.meta.url), "utf8");
  assert.match(page, /save-collection-workspace[^"\n]*w-full[^"\n]*max-w-none/);
  assert.match(page, /save-collection-details-grid grid/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, max\(24rem, calc\(\(100% - var\(--spacing-6\)\) \/ 2\)\)\), 1fr\)\)/);
  assert.match(page, /<fieldset[^>]*className="save-collection-account-group\b/);
  assert.match(page, /<legend[^>]*>Account Number \/ Card Number<\/legend>/);
  assert.match(page, /className="save-collection-account-fields"/);
  assert.match(page, /className="save-collection-currency-prefix" aria-hidden="true"/);
  const receipt = page.slice(page.indexOf("const receiptSection ="), page.indexOf("return (", page.indexOf("const receiptSection =")));
  assert.match(receipt, /accent="receipt"[\s\S]*className="col-span-full"/);
  assert.match(receipt, /\{receiptPanel\}[\s\S]*<SaveCollectionReadySummary/);
  assert.match(page, /save-collection-submit-workspace[\s\S]*<CollectionSourceMatchField[\s\S]*id="save-collection-actions"/);
  assert.match(css, /\.save-collection-workspace \.save-collection-section\s*\{[^}]*min-width: 0;[^}]*border: 1px solid hsl\(var\(--border\)\);[^}]*background: hsl\(var\(--card\)\)/s);
  assert.match(css, /\.save-collection-workspace \.save-collection-account-fields\s*\{[^}]*repeat\(auto-fit, minmax\(min\(100%, 12rem\), 1fr\)\)/s);
  assert.match(css, /\.save-collection-workspace \.save-collection-currency-prefix\s*\{[^}]*pointer-events: none;/s);
  assert.doesNotMatch(css, /(?:^|\})\s*(?:body|html|:root|\.workspace-|\.navbar)/);
  assert.doesNotMatch(css, /gradient|box-shadow|backdrop-filter/);
});

test("compact review preserves full string identifiers behind the original visibility control", () => {
  const readiness = getSaveCollectionReadiness(values);
  const render = (cardNumberVisible: boolean) => renderToStaticMarkup(createElement(SaveCollectionReadySummary, {
    values, readiness, receiptCount: 0, receiptDrafts: [], cardNumberVisible,
    cardNumberVisibilityDisabled: true, onToggleCardNumberVisibility: () => undefined,
  }));
  const hidden = render(false);
  assert.doesNotMatch(hidden, /00009007199254740993/);
  assert.match(hidden, /Show full card number in review/);
  assert.match(hidden, /disabled=""/);
  const visible = render(true);
  assert.match(visible, /00009007199254740993/);
  assert.match(visible, /aria-pressed="true"/);
  assert.match(visible, /role="status" aria-live="polite"/);
  assert.match(visible, /<dl class="grid grid-cols-2/);
  assert.doesNotMatch(visible, /text-emerald|text-amber/);
});
