import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCollectionReceiptDraft } from "../receipt-validation";
import type { SaveCollectionFormValues } from "../save-collection-page-utils";
import {
  buildSaveCollectionReadySummary,
  buildSaveCollectionReceiptReviewHints,
  buildSaveCollectionSuccessDescription,
} from "../save-collection-ready-summary";

const baseValues: SaveCollectionFormValues = {
  staffNickname: "Korie",
  customerName: "Test Customer",
  icNumber: "900101010101",
  customerPhone: "0123456789",
  accountNumber: "1234567890",
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
  assert.match(summary.find((item) => item.label === "Amount")?.value || "", /1,650\.00/);
  assert.equal(summary.find((item) => item.label === "Receipt")?.value, "1 receipt");
});

test("buildSaveCollectionReadySummary marks missing values", () => {
  const summary = buildSaveCollectionReadySummary({
    values: { ...baseValues, customerName: "", amount: "" },
    receiptCount: 0,
  });

  assert.equal(summary.find((item) => item.label === "Customer")?.missing, true);
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
  });

  assert.match(description, /1,650\.00/);
  assert.match(description, /Korie/);
  assert.match(description, /batch P10/);
  assert.match(description, /1 receipt/);
});
