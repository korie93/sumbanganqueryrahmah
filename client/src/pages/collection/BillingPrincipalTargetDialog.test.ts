import assert from "node:assert/strict";
import test from "node:test";
import type { BillingPrincipalReportRow } from "@/lib/api/collection-billing-principal";
import {
  buildBillingPrincipalTargetDraft,
  buildBillingPrincipalTargetMutationRows,
  validateBillingPrincipalTargetDraft,
} from "./BillingPrincipalTargetDialog";

const rows: BillingPrincipalReportRow[] = (["D3", "D4", "D5", "D6"] as const).map(
  (aging, index) => ({
    aging,
    totalOsp: `${(index + 1) * 1000}.00`,
    targetPercentage: `${10 + index}.0000`,
    targetOsp: `${(index + 1) * (100 + index * 10)}.00`,
    resultPercentage: "0.0000",
    ospClosed: "0.00",
    closedAccountCount: 0,
  }),
);

test("target draft exposes percentage only and keeps Saved Target OSP authoritative", () => {
  const draft = buildBillingPrincipalTargetDraft(rows);
  assert.deepEqual(Object.keys(draft.D3 || {}), ["percentage"]);

  draft.D3 = { percentage: "55.5000" };
  const targets = buildBillingPrincipalTargetMutationRows(rows, draft);
  assert.deepEqual(targets[0], {
    agingBucket: "D3",
    totalOspBaseline: "1000.00",
    targetPercentage: "55.5000",
  });
});

test("target draft rejects percentages outside zero through one hundred", () => {
  const draft = buildBillingPrincipalTargetDraft(rows);
  draft.D6 = { percentage: "100.0001" };
  assert.match(validateBillingPrincipalTargetDraft(draft), /D6 Target %/);

  draft.D6 = { percentage: "100" };
  assert.equal(validateBillingPrincipalTargetDraft(draft), "");
});
