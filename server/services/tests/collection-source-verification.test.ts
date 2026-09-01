import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../../http/errors";
import type { SavedCollectionSourceMatch } from "../../repositories/search-repository-types";
import { verifySelectedSavedCollectionSource } from "../collection/collection-source-verification";

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
