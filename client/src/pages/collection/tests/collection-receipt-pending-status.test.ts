import assert from "node:assert/strict";
import test from "node:test";
import { resolveCollectionReceiptPendingStatusCopy } from "../collection-receipt-pending-status";

test("resolveCollectionReceiptPendingStatusCopy keeps pending uploads neutral", () => {
  const copy = resolveCollectionReceiptPendingStatusCopy("pending");

  assert.equal(copy.badgeLabel, "Pending Upload");
  assert.equal(copy.badgeVariant, "outline");
});

test("resolveCollectionReceiptPendingStatusCopy explains active scanning", () => {
  const copy = resolveCollectionReceiptPendingStatusCopy("saving");

  assert.equal(copy.badgeLabel, "Scanning / Saving");
  assert.equal(copy.badgeVariant, "secondary");
  assert.match(copy.helperText, /diimbas/i);
});

test("resolveCollectionReceiptPendingStatusCopy explains retry state", () => {
  const copy = resolveCollectionReceiptPendingStatusCopy("failed");

  assert.equal(copy.badgeLabel, "Needs Retry");
  assert.equal(copy.badgeVariant, "destructive");
  assert.match(copy.helperText, /cuba Save Collection semula/i);
});
