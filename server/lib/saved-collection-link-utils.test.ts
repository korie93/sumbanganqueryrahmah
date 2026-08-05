import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSavedCollectionLookupTerms,
  extractSavedCollectionIdentity,
  selectSavedCollectionSourceMatch,
} from "./saved-collection-link-utils";

const lookup = {
  customerName: "Mohd Bin Sudin",
  icNumber: "931120-11-5437",
  customerPhone: "+60 12-345 6789",
  accountNumber: "ACC 1001",
};

test("Saved collection lookup recognizes common spreadsheet headers and bounded identifiers", () => {
  assert.deepEqual(extractSavedCollectionIdentity({
    "Customer Name": " Mohd Bin Sudin ",
    "No. KP": "931120-11-5437",
    "No Telefon": "+60 12-345 6789",
    "Account No": " ACC 1001 ",
  }), {
    customerName: "mohd bin sudin",
    icNumber: "931120115437",
    customerPhone: "0123456789",
    accountNumbers: ["ACC1001"],
  });

  assert.deepEqual(buildSavedCollectionLookupTerms(lookup), [
    "931120115437",
    "931120-11-5437",
    "0123456789",
    "60123456789",
    "ACC1001",
  ]);
});

test("Saved collection matching never links on customer name alone", () => {
  const match = selectSavedCollectionSourceMatch(lookup, [{
    rowId: "row-name-only",
    sourceImportId: "import-1",
    sourceImportName: "NPL JULY",
    sourceFilename: "npl.xlsx",
    sourceCreatedAt: "2026-08-01T00:00:00.000Z",
    jsonDataJsonb: { Name: "Mohd Bin Sudin" },
  }]);

  assert.equal(match, null);
});

test("Saved collection matching accepts exact IC and chooses the newest strongest candidate", () => {
  const match = selectSavedCollectionSourceMatch(lookup, [
    {
      rowId: "row-old",
      sourceImportId: "import-old",
      sourceImportName: "NPL JUNE",
      sourceFilename: "june.xlsx",
      sourceCreatedAt: "2026-06-01T00:00:00.000Z",
      jsonDataJsonb: { IC: "931120115437", Name: "Mohd Bin Sudin" },
    },
    {
      rowId: "row-new",
      sourceImportId: "import-new",
      sourceImportName: "NPL JULY",
      sourceFilename: "july.xlsx",
      sourceCreatedAt: "2026-07-01T00:00:00.000Z",
      jsonDataJsonb: { IC: "931120-11-5437", Name: "Mohd Bin Sudin" },
    },
  ]);

  assert.deepEqual(match, {
    rowId: "row-new",
    sourceImportId: "import-new",
    sourceImportName: "NPL JULY",
    sourceFilename: "july.xlsx",
    matchBasis: "ic",
  });
});

test("Saved collection matching rejects an exact IC when a known account conflicts", () => {
  const match = selectSavedCollectionSourceMatch(lookup, [{
    rowId: "row-other-account",
    sourceImportId: "import-1",
    sourceImportName: "NPL JULY",
    sourceFilename: "july.xlsx",
    sourceCreatedAt: "2026-07-01T00:00:00.000Z",
    jsonDataJsonb: {
      IC: "931120-11-5437",
      "Account Number": "ACC 9999",
    },
  }]);

  assert.equal(match, null);
});

test("Saved collection matching accepts a matching Card No when Account No differs", () => {
  const match = selectSavedCollectionSourceMatch({
    customerName: "Test Customer Multi Account",
    icNumber: "900101015555",
    customerPhone: "",
    accountNumber: "COLLECTION2002",
  }, [{
    rowId: "row-multi-account",
    sourceImportId: "import-test",
    sourceImportName: "TEST MULTI ACCOUNT",
    sourceFilename: "test-multi-account.xlsx",
    sourceCreatedAt: "2026-08-05T00:00:00.000Z",
    jsonDataJsonb: {
      "Customer Name": "Test Customer Multi Account",
      "ID No": "900101015555",
      "Account No": "SOURCE1001",
      "Card No": "COLLECTION2002",
    },
  }]);

  assert.deepEqual(match, {
    rowId: "row-multi-account",
    sourceImportId: "import-test",
    sourceImportName: "TEST MULTI ACCOUNT",
    sourceFilename: "test-multi-account.xlsx",
    matchBasis: "ic",
  });
});

test("Saved collection matching requires phone and account together when IC is unavailable", () => {
  const candidate = {
    rowId: "row-1",
    sourceImportId: "import-1",
    sourceImportName: "NPL JULY",
    sourceFilename: "july.xlsx",
    sourceCreatedAt: "2026-07-01T00:00:00.000Z",
    jsonDataJsonb: {
      Phone: "0123456789",
      "Account Number": "ACC1001",
    },
  };

  assert.equal(
    selectSavedCollectionSourceMatch({ ...lookup, accountNumber: "OTHER" }, [candidate]),
    null,
  );
  assert.equal(selectSavedCollectionSourceMatch(lookup, [candidate])?.matchBasis, "phone_and_account");
});

test("Saved collection matching rejects phone-account matches that conflict with a known IC", () => {
  const match = selectSavedCollectionSourceMatch(lookup, [{
    rowId: "row-1",
    sourceImportId: "import-1",
    sourceImportName: "NPL JULY",
    sourceFilename: "july.xlsx",
    sourceCreatedAt: "2026-07-01T00:00:00.000Z",
    jsonDataJsonb: {
      IC: "800101101234",
      Phone: "0123456789",
      "Account Number": "ACC1001",
    },
  }]);

  assert.equal(match, null);
});
