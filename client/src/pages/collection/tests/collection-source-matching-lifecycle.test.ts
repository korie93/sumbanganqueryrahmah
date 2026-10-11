import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCollectionSourceMatching } from "../useCollectionSourceMatching";

const identity = {
  customerName: "Synthetic Customer",
  icNumber: "SYNTHETIC-001",
  customerPhone: "0100000000",
  accountNumber: "TEST-ACCOUNT",
  cardNumber: "",
  paymentDate: "2024-01-15",
  amount: "10",
};

function renderMatching(
  input = identity,
  options: Parameters<typeof useCollectionSourceMatching>[1] = {},
) {
  const snapshots: ReturnType<typeof useCollectionSourceMatching>[] = [];
  function Fixture() {
    snapshots.push(useCollectionSourceMatching(input, options));
    return null;
  }
  renderToStaticMarkup(createElement(Fixture));
  return snapshots[0]!;
}

test("an incomplete matching form starts without validation errors or a selected match", () => {
  const result = renderMatching({ ...identity, customerName: "" });
  assert.equal(result.status, "incomplete");
  assert.equal(result.error, "");
  assert.equal(result.errorKind, null);
  assert.equal(result.selectedMatch, null);
  assert.equal(result.hasSearched, false);
  assert.equal(result.canRetry, false);
});

test("a complete form starts waiting rather than implying a completed search", () => {
  const result = renderMatching();
  assert.equal(result.status, "waiting");
  assert.equal(result.loading, false);
  assert.equal(result.hasSearched, false);
  assert.equal(result.canRetry, false);
  assert.deepEqual(result.matches, []);
});

test("reset confirmation and submitting can pause a complete form before effects run", () => {
  const result = renderMatching(identity, { paused: true });
  assert.equal(result.status, "paused");
  assert.equal(result.loading, false);
  assert.equal(result.canRetry, false);
});

test("disabled matching has no matching context even with complete identity", () => {
  const result = renderMatching(identity, { enabled: false, paused: true, scopeKey: "other-nickname" });
  assert.equal(result.status, "paused");
  assert.equal(result.selectedMatch, null);
  assert.equal(result.error, "");
  assert.equal(result.canRetry, false);
});

// Stateful timing, cancellation, stale responses, and pause/resume behavior run
// against the real React hook in tests/visual/collection-auto-matching.spec.ts.
