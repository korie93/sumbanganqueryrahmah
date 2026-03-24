import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionReceiptPanelSummary } from "../collection-receipt-panel-utils";

test("buildCollectionReceiptPanelSummary reports empty receipt state clearly", () => {
  const summary = buildCollectionReceiptPanelSummary({});

  assert.equal(summary.existingCount, 0);
  assert.equal(summary.pendingCount, 0);
  assert.equal(summary.willReplace, false);
  assert.equal(summary.message, "No receipt selected yet.");
});

test("buildCollectionReceiptPanelSummary reports replacement intent when removals and pending uploads coexist", () => {
  const summary = buildCollectionReceiptPanelSummary({
    existingCount: 2,
    removedExistingCount: 2,
    pendingCount: 1,
  });

  assert.equal(summary.keptExistingCount, 0);
  assert.equal(summary.removedExistingCount, 2);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.willReplace, true);
  assert.equal(summary.message, "2 receipts will be replaced by 1 receipt on save.");
});

test("buildCollectionReceiptPanelSummary keeps remaining existing receipts visible alongside pending uploads", () => {
  const summary = buildCollectionReceiptPanelSummary({
    existingCount: 3,
    removedExistingCount: 1,
    pendingCount: 2,
  });

  assert.equal(summary.keptExistingCount, 2);
  assert.equal(summary.willReplace, true);
  assert.match(summary.message, /2 receipts currently linked/i);
  assert.match(summary.message, /1 receipt marked for removal/i);
  assert.match(summary.message, /2 receipts pending upload/i);
});
