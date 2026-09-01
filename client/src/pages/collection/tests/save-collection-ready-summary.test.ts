import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCollectionReceiptDraft } from "../receipt-validation";
import type { SaveCollectionFormValues } from "../save-collection-page-utils";
import {
  buildSaveCollectionReadySummary,
  buildSaveCollectionReceiptReviewHints,
  buildSaveCollectionSuccessDescription,
} from "../save-collection-ready-summary";
import {
  buildSaveCollectionLastSavedSummary,
  buildSaveCollectionReceiptLabel,
} from "../save-collection-post-save";

const baseValues: SaveCollectionFormValues = {
  staffNickname: "Korie",
  customerName: "Test Customer",
  icNumber: "900101010101",
  customerPhone: "0123456789",
  accountNumber: "1234567890",
  cardNumber: "0000123412345678",
  batch: "P10",
  paymentDate: "2026-05-17",
  amount: "1650",
};

test("buildSaveCollectionReadySummary exposes key save fields", () => {
  const summary = buildSaveCollectionReadySummary({
    values: baseValues,
    receiptCount: 1,
  });

  assert.equal(summary.find((item) => item.label === "Customer")?.value, "Test Customer");
  assert.equal(summary.some((item) => item.label === "Source File"), false);
  assert.equal(summary.find((item) => item.label === "Card")?.value, "Card ending 5678");
  assert.doesNotMatch(JSON.stringify(summary), /0000123412345678/);
  assert.match(summary.find((item) => item.label === "Amount")?.value || "", /1,650\.00/);
  assert.equal(summary.find((item) => item.label === "Receipt")?.value, "1 receipt");
});

test("buildSaveCollectionReadySummary marks missing and invalid values from shared validation", () => {
  const summary = buildSaveCollectionReadySummary({
    values: {
      ...baseValues,
      customerName: "",
      customerPhone: "bad",
      amount: "",
    },
    receiptCount: 0,
  });

  assert.equal(summary.find((item) => item.label === "Customer")?.missing, true);
  assert.equal(summary.find((item) => item.label === "Phone")?.value, "Perlu diperbetulkan");
  assert.match(summary.find((item) => item.label === "Phone")?.error || "", /invalid/i);
  assert.equal(summary.find((item) => item.label === "Amount")?.missing, true);
  assert.equal(summary.find((item) => item.label === "Receipt")?.value, "0 receipts");
});

test("buildSaveCollectionReceiptReviewHints warns when receipt metadata differs", () => {
  const hints = buildSaveCollectionReceiptReviewHints({
    values: baseValues,
    receiptDrafts: [
      createEmptyCollectionReceiptDraft({
        receiptAmount: "1200",
        receiptDate: "2026-05-16",
        receiptReference: "999999",
      }),
    ],
  });

  assert.equal(hints.length, 3);
  assert.match(hints[0]?.message || "", /amount/i);
  assert.match(hints[1]?.message || "", /date/i);
  assert.match(hints[2]?.message || "", /reference/i);
});

test("buildSaveCollectionSuccessDescription includes amount, nickname, batch, and receipt count", () => {
  const description = buildSaveCollectionSuccessDescription({
    values: baseValues,
    receiptCount: 1,
    sourceLabel: "NPL CC P10 JULY",
  });

  assert.match(description, /1,650\.00/);
  assert.match(description, /Korie/);
  assert.match(description, /batch P10/);
  assert.match(description, /1 receipt/);
  assert.match(description, /NPL CC P10 JULY/);
});

test("buildSaveCollectionLastSavedSummary keeps post-save action copy non-sensitive", () => {
  const summary = buildSaveCollectionLastSavedSummary({
    values: baseValues,
    receiptCount: 2,
    sourceLabel: "NPL CC P10 JULY",
    savedAt: new Date("2026-05-18T09:30:00.000Z"),
  });

  assert.equal(summary.customerName, "Test Customer");
  assert.equal(summary.sourceLabel, "NPL CC P10 JULY");
  assert.equal(summary.staffNickname, "Korie");
  assert.equal(summary.batch, "P10");
  assert.match(summary.amountLabel, /1,650\.00/);
  assert.equal(summary.receiptLabel, "2 receipts");
  assert.doesNotMatch(JSON.stringify(summary), /900101010101|1234567890/);
});

test("buildSaveCollectionReceiptLabel normalizes invalid counts", () => {
  assert.equal(buildSaveCollectionReceiptLabel(1), "1 receipt");
  assert.equal(buildSaveCollectionReceiptLabel(Number.NaN), "0 receipts");
  assert.equal(buildSaveCollectionReceiptLabel(-5), "0 receipts");
});
