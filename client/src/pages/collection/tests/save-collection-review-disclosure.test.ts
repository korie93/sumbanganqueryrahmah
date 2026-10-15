import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaveCollectionReadySummary } from "../SaveCollectionReadySummary";
import { getSaveCollectionReadiness, type SaveCollectionFormValues } from "../save-collection-page-utils";

const values: SaveCollectionFormValues = {
  staffNickname: "Fixture Collector", customerName: "Synthetic Customer",
  icNumber: "900101010101", customerPhone: "0123456789", accountNumber: "000123456789",
  cardNumber: "", batch: "P10", paymentDate: "2020-01-01", amount: "100.00",
};

function renderSummary(formValues: SaveCollectionFormValues, showValidationDetails = false) {
  return renderToStaticMarkup(createElement(SaveCollectionReadySummary, {
    values: formValues, readiness: getSaveCollectionReadiness(formValues),
    receiptCount: 0, receiptDrafts: [], cardNumberVisible: false,
    onToggleCardNumberVisibility: () => undefined, onCorrectField: () => undefined,
    showValidationDetails,
  }));
}

test("an incomplete first-run form offers a neutral, closed correction disclosure", () => {
  const markup = renderSummary({ ...values, customerName: "" });
  assert.match(markup, /<details class="group"><summary/);
  assert.match(markup, /Lihat medan yang perlu dilengkapkan/);
  assert.doesNotMatch(markup, /<details[^>]*\bopen\b/);
  assert.doesNotMatch(markup, /border-warning\/35 bg-warning\/5/);
  assert.match(markup, /aria-controls="save-collection-customer-name"/);
});

test("validation details cannot be folded away while errors are displayed", () => {
  const markup = renderSummary({ ...values, customerName: "" }, true);
  assert.doesNotMatch(markup, /<details|<summary/);
  assert.match(markup, /aria-label="Betulkan Customer Name"/);
  assert.match(markup, /border-warning\/35 bg-warning\/5/);
  const page = readFileSync(new URL("../SaveCollectionPage.tsx", import.meta.url), "utf8");
  assert.match(page, /showValidationDetails=\{Boolean\(state\.submitFailure\) \|\| Object\.values\(state\.fieldErrors\)\.some\(Boolean\)\}/);
});

test("completed form fields expose the review without claiming a completed source match", () => {
  const markup = renderSummary(values);
  assert.doesNotMatch(markup, /<details|Ready to Save/);
  assert.match(markup, /Medan Wajib Lengkap/);
  assert.match(markup, /Status padanan Saved ditunjukkan berasingan di bawah/);
  assert.match(markup, /<dl class="grid grid-cols-2/);
});
