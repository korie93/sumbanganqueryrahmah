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

test("collection form groups use headings and clear boundaries without nested decorative cards", () => {
  const markup = renderToStaticMarkup(createElement(SaveCollectionFormSection, {
    title: "Customer Details", description: "Match the existing saved source.",
    children: createElement("input", { "aria-label": "Customer Name" }),
  }));
  assert.match(markup, /<section/);
  assert.match(markup, />Customer Details<\/h3>/);
  assert.match(markup, /aria-label="Customer Name"/);
  assert.doesNotMatch(markup, /rounded|shadow|bg-gradient/);
  const page = readFileSync(new URL("../SaveCollectionPage.tsx", import.meta.url), "utf8");
  assert.match(page, /<section aria-labelledby="save-collection-form-title"/);
  assert.match(page, /<fieldset disabled=\{accessSuspended\}/);
  assert.match(page, /keyboardOpen \? "static" : "sticky bottom-0/);
  assert.match(page, /data-floating-ai-avoid="true"/);
  assert.doesNotMatch(page, /bg-gradient|backdrop|<Card|cleaner mobile flow/);
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
