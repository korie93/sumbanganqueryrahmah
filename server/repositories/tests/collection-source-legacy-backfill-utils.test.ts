import assert from "node:assert/strict";
import test from "node:test";
import {
  assessLegacyCollectionBackfillCandidate,
  type LegacyCollectionBackfillCandidate,
} from "../collection-source-legacy-backfill-utils";
import { hashCollectionSourceIdentifier } from "../collection-source-repository-utils";

function createCandidate(
  overrides: Partial<LegacyCollectionBackfillCandidate> = {},
): LegacyCollectionBackfillCandidate {
  const accountNumber = "0012345678901234";
  return {
    recordId: "00000000-0000-4000-8000-000000000001",
    sourceImportId: "source-1",
    sourceDataRowId: "row-1",
    paymentDate: "2026-09-10",
    resolvedAccountNumber: accountNumber,
    sourceRowExists: true,
    dataRowExists: true,
    sourceEnabled: true,
    sourceCompatible: true,
    sourceImportActive: true,
    sourceValidFrom: "2026-09-01",
    sourceValidTo: "2026-09-30",
    sourceImportName: "P10 September",
    sourceFilename: "p10-september.xlsb",
    sourceAccountHash: hashCollectionSourceIdentifier(accountNumber),
    sourceAccountMatchCount: 1,
    sourceCardNumberLast4: "4321",
    sourceObligationKey: `account:${hashCollectionSourceIdentifier(accountNumber)}`,
    sourceTotalDue: "1000.00",
    sourceBillingPrincipalOsp: "8000.00",
    sourceAgingBucket: "D4",
    sourceCallingDate: "2026-09-01",
    existingCardNumberLast4: null,
    existingAgingBucket: null,
    existingCallingDate: null,
    existingCallingWindowEndExclusive: null,
    existingTotalDue: null,
    existingBillingPrincipalOsp: null,
    existingSettlementCycleKey: null,
    ...overrides,
  };
}

test("legacy Collection backfill accepts only an exact unique governed account snapshot", () => {
  const assessment = assessLegacyCollectionBackfillCandidate(createCandidate());
  assert.equal(assessment.accepted, true);
  if (!assessment.accepted) return;

  assert.equal(assessment.plan.agingBucket, "D4");
  assert.equal(assessment.plan.totalDue, "1000.00");
  assert.equal(assessment.plan.billingPrincipalOsp, "8000.00");
  assert.equal(
    assessment.plan.settlementCycleKey,
    `2026-09-01:${assessment.plan.sourceObligationKey}`,
  );
});

test("legacy Collection backfill fails closed for ambiguous, mismatched, or stale source data", () => {
  const ambiguous = assessLegacyCollectionBackfillCandidate(createCandidate({
    sourceAccountMatchCount: 2,
  }));
  const mismatched = assessLegacyCollectionBackfillCandidate(createCandidate({
    sourceAccountHash: hashCollectionSourceIdentifier("different-account"),
  }));
  const outsideWindow = assessLegacyCollectionBackfillCandidate(createCandidate({
    paymentDate: "2026-10-01",
  }));
  const snapshotConflict = assessLegacyCollectionBackfillCandidate(createCandidate({
    existingTotalDue: "999.99",
  }));

  assert.deepEqual(ambiguous, { accepted: false, reason: "ambiguous_account_match" });
  assert.deepEqual(mismatched, { accepted: false, reason: "account_mismatch" });
  assert.deepEqual(outsideWindow, { accepted: false, reason: "outside_source_validity" });
  assert.deepEqual(snapshotConflict, { accepted: false, reason: "snapshot_conflict" });
});

test("legacy Collection backfill never treats card last four as identity proof", () => {
  const assessment = assessLegacyCollectionBackfillCandidate(createCandidate({
    resolvedAccountNumber: null,
    sourceAccountHash: null,
    sourceCardNumberLast4: "4321",
  }));

  assert.deepEqual(assessment, { accepted: false, reason: "account_match_unavailable" });
});
