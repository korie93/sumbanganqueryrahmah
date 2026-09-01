import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../../http/errors";
import type { SavedCollectionSourceMatch } from "../../repositories/search-repository-types";
import {
  verifyEligibleSavedCollectionSource,
  verifySelectedSavedCollectionSource,
} from "../collection/collection-source-verification";
import type { CollectionIndexedSourceMatch } from "../../storage-postgres-collection-types";

const lookup = {
  customerName: "Alice Tan",
  icNumber: "900101015555",
  customerPhone: "0123456789",
  accountNumber: "ACC-1001",
  sourceImportId: "import-a",
};

function buildMatch(overrides: Partial<SavedCollectionSourceMatch> = {}): SavedCollectionSourceMatch {
  return {
    rowId: "row-a",
    sourceImportId: "import-a",
    sourceImportName: "FILE A",
    sourceFilename: "file-a.xlsx",
    matchBasis: "ic",
    matchAccuracy: 100,
    matchedFields: ["customer_name", "ic_number", "account_number"],
    comparedFields: ["customer_name", "ic_number", "account_number"],
    totalDue: "200.00",
    billingPrincipalOsp: "180.00",
    callingDate: "2026-08-12",
    callingWindowEnd: "2026-09-11",
    callingWindowEndExclusive: "2026-09-12",
    ...overrides,
  };
}

function expectHttpCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    return true;
  };
}

function buildIndexedMatch(
  overrides: Partial<CollectionIndexedSourceMatch> = {},
): CollectionIndexedSourceMatch {
  return {
    sourceImportId: "import-governed-1",
    sourceDataRowId: "row-governed-1",
    sourceImportName: "Governed Source",
    sourceFilename: "governed-source.xlsb",
    sourceObligationKey: "card:blind-index",
    settlementCycleKey: "2026-08-12:card:blind-index",
    cardNumberLast4: "5678",
    matchBasis: "card_number",
    totalDue: "1000.00" as CollectionIndexedSourceMatch["totalDue"],
    billingPrincipalOsp: "5000.00" as CollectionIndexedSourceMatch["billingPrincipalOsp"],
    totalOsb: null,
    agingBucket: "D3",
    callingDate: "2026-08-12",
    callingWindowEnd: "2026-09-11",
    callingWindowEndExclusive: "2026-09-12",
    duplicateSourceCount: 1,
    ...overrides,
  };
}

test("source verification fails closed when the selected Saved file is unavailable", async () => {
  await assert.rejects(
    () => verifySelectedSavedCollectionSource({
      getImportById: async () => null,
      findSavedCollectionSourcesForRecord: async () => {
        throw new Error("matching must not run for a missing file");
      },
    } as never, lookup),
    expectHttpCode("COLLECTION_SOURCE_FILE_NOT_FOUND"),
  );
});
test("source verification never accepts a match leaked from File B while File A is selected", async () => {
  let observedSourceImportId = "";
  await assert.rejects(
    () => verifySelectedSavedCollectionSource({
      getImportById: async () => ({ id: "import-a" }),
      findSavedCollectionSourcesForRecord: async (request: { sourceImportId?: string | null }) => {
        observedSourceImportId = String(request.sourceImportId || "");
        return [buildMatch({
          rowId: "row-b",
          sourceImportId: "import-b",
          sourceImportName: "FILE B",
          sourceFilename: "file-b.xlsx",
          totalDue: "999.00",
        })];
      },
    } as never, lookup),
    expectHttpCode("COLLECTION_SOURCE_SCOPE_MISMATCH"),
  );
  assert.equal(observedSourceImportId, "import-a");
});

test("source verification rejects equally strong duplicate rows in one selected file", async () => {
  await assert.rejects(
    () => verifySelectedSavedCollectionSource({
      getImportById: async () => ({ id: "import-a" }),
      findSavedCollectionSourcesForRecord: async () => [
        buildMatch({ rowId: "row-a-1" }),
        buildMatch({ rowId: "row-a-2", totalDue: "500.00" }),
      ],
    } as never, lookup),
    expectHttpCode("COLLECTION_SOURCE_AMBIGUOUS_MATCH"),
  );
});

test("source verification rejects a matched row with no parseable Calling Date window", async () => {
  await assert.rejects(
    () => verifySelectedSavedCollectionSource({
      getImportById: async () => ({ id: "import-a" }),
      findSavedCollectionSourcesForRecord: async () => [buildMatch({
        callingDate: null,
        callingWindowEnd: null,
        callingWindowEndExclusive: null,
      })],
    } as never, lookup),
    expectHttpCode("COLLECTION_SOURCE_CALLING_DATE_INVALID"),
  );
});

test("eligible source verification accepts exact Card-only matching with leading zeros intact", async () => {
  let observedLookup: Record<string, unknown> = {};
  const cardNumber = "0000123412345678";
  const match = await verifyEligibleSavedCollectionSource({
    findEligibleCollectionSourceMatches: async (input: Record<string, unknown>) => {
      observedLookup = input;
      return { eligibleSourceCount: 1, matches: [buildIndexedMatch()] };
    },
  } as never, {
    paymentDate: "2026-09-01",
    cardNumber,
  });

  assert.equal(match.matchBasis, "card_number");
  assert.equal(observedLookup.cardNumber, cardNumber);
  assert.equal("accountNumber" in observedLookup, false);
});

test("eligible source verification blocks Account/Card values that resolve to different rows", async () => {
  await assert.rejects(
    () => verifyEligibleSavedCollectionSource({
      findEligibleCollectionSourceMatches: async () => ({
        eligibleSourceCount: 1,
        matches: [
          buildIndexedMatch({
            sourceDataRowId: "row-account",
            sourceObligationKey: "account:a",
            settlementCycleKey: "2026-08-12:account:a",
            matchBasis: "account_number",
          }),
          buildIndexedMatch({
            sourceDataRowId: "row-card",
            sourceObligationKey: "card:b",
            settlementCycleKey: "2026-08-12:card:b",
            matchBasis: "card_number",
          }),
        ],
      }),
    } as never, {
      paymentDate: "2026-09-01",
      accountNumber: "ACC-1",
      cardNumber: "0000123412345678",
    }),
    expectHttpCode("COLLECTION_SOURCE_IDENTITY_CONFLICT"),
  );
});

test("eligible source verification fails closed when no governed source is active", async () => {
  await assert.rejects(
    () => verifyEligibleSavedCollectionSource({
      findEligibleCollectionSourceMatches: async () => ({
        eligibleSourceCount: 0,
        matches: [],
      }),
    } as never, {
      paymentDate: "2026-09-01",
      cardNumber: "0000123412345678",
    }),
    expectHttpCode("COLLECTION_SOURCE_NOT_CONFIGURED"),
  );
});
