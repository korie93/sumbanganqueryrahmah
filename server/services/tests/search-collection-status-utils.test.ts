import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSearchCollectionStatusCandidates,
  buildSearchCollectionStatuses,
} from "../search-collection-status-utils";
import { MAX_SEARCH_COLLECTION_STATUS_CANDIDATES } from "../../repositories/search-repository-types";

test("search collection status candidates normalize every recognized account column", () => {
  const candidates = buildSearchCollectionStatusCandidates([
    {
      id: "row-1",
      importId: "import-1",
      jsonDataJsonb: {
        "No. KP": "900101-10-1234",
        "No Telefon": "+60 12-345 6789",
        "Account No": " ACC 9999 ",
        "Card No": " ACC 1001 ",
      },
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.rowId, "row-1");
  assert.equal(candidates[0]?.sourceImportId, "import-1");
  assert.equal(candidates[0]?.icValue, "900101101234");
  assert.equal(candidates[0]?.phoneValue, "0123456789");
  assert.deepEqual(candidates[0]?.accountValues, ["ACC9999", "ACC1001"]);
});

test("search collection status candidates support rows with distinct account and card numbers", () => {
  const candidates = buildSearchCollectionStatusCandidates([{
    id: "row-multi-account",
    importId: "import-test",
    jsonDataJsonb: {
      "Customer Name": "Test Customer Multi Account",
      "ID No": "900101015555",
      "Account No": "SOURCE1001",
      "Card No": "COLLECTION2002",
    },
  }]);

  assert.equal(candidates[0]?.icValue, "900101015555");
  assert.deepEqual(candidates[0]?.accountValues, ["SOURCE1001", "COLLECTION2002"]);
});

test("search collection status candidates exclude home and office phones from customer identity", () => {
  const candidates = buildSearchCollectionStatusCandidates([{
    id: "row-office-phone",
    importId: "import-test",
    jsonDataJsonb: {
      "No. Telefon Rumah": "041234567",
      OfficePhone: "0312345678",
      "Account No": "OFFICE-1001",
    },
  }]);

  assert.equal(candidates[0]?.phoneValue, null);
  assert.deepEqual(candidates[0]?.accountValues, ["OFFICE-1001"]);
});

test("search collection status candidates bound account values per row", () => {
  const candidates = buildSearchCollectionStatusCandidates([{
    id: "row-bounded",
    importId: "import-1",
    jsonDataJsonb: {
      Acc: "ACC-1",
      "Acc No": "ACC-2",
      Account: "ACC-3",
      "Account No": "ACC-4",
      "Account Number": "ACC-5",
      Acct: "ACC-6",
      "Acct No": "ACC-7",
      Akaun: "ACC-8",
      "Card No": "ACC-9",
      "Card Number": "ACC-10",
    },
  }]);

  assert.deepEqual(candidates[0]?.accountValues, [
    "ACC-1",
    "ACC-2",
    "ACC-3",
    "ACC-4",
    "ACC-5",
    "ACC-6",
    "ACC-7",
    "ACC-8",
  ]);
});

test("search collection statuses expose authorized collection details while redacting Saved source", () => {
  const rows = [
    { id: "row-1", importId: "import-1", jsonDataJsonb: { IC: "900101101234" } },
    { id: "row-2", importId: "import-1", jsonDataJsonb: { Phone: "0123456789" } },
    { id: "row-3", importId: "import-1", jsonDataJsonb: { Name: "Alice" } },
  ];
  const candidates = buildSearchCollectionStatusCandidates(rows);
  const statuses = buildSearchCollectionStatuses({
    rows,
    candidates,
    matches: [{
      rowId: "row-1",
      recordCount: 2,
      isHistorical: false,
      latestPaymentDate: "2026-08-01",
      latestCreatedAt: "2026-08-01T08:00:00.000Z",
      latestStaffNickname: "Collector Alpha",
      latestCreatedByLogin: "collector.login",
      latestAccountNumber: "ACC-1001",
      matchedAccountHash: null,
      latestAmount: "150.50",
      sourceImportName: "NPL CC P10 JULY",
      sourceFilename: "npl.xlsx",
      purgedAt: null,
      purgedBy: null,
      matchBasis: "source_and_identifier",
    }],
    includeSourceDetails: false,
  });

  assert.equal(statuses.get("row-1")?.state, "recorded");
  assert.equal(statuses.get("row-1")?.recordCount, 2);
  assert.equal(statuses.get("row-1")?.latestStaffNickname, "Collector Alpha");
  assert.equal(statuses.get("row-1")?.latestCreatedByLogin, "collector.login");
  assert.equal(statuses.get("row-1")?.latestAccountNumber, "ACC-1001");
  assert.equal(statuses.get("row-1")?.latestAmount, "150.50");
  assert.equal(statuses.get("row-1")?.sourceImportName, null);
  assert.equal(statuses.get("row-2")?.state, "not_recorded");
  assert.equal(statuses.get("row-3")?.state, "unavailable");
});

test("search collection status candidates stay bounded without creating false missing statuses", () => {
  const rows = Array.from(
    { length: MAX_SEARCH_COLLECTION_STATUS_CANDIDATES + 1 },
    (_, index) => ({
      id: `row-${index}`,
      importId: "import-1",
      jsonDataJsonb: { "IC Number": `90010101${String(index).padStart(4, "0")}` },
    }),
  );

  const candidates = buildSearchCollectionStatusCandidates(rows);
  const statuses = buildSearchCollectionStatuses({
    rows,
    candidates,
    matches: [],
    includeSourceDetails: false,
  });

  assert.equal(candidates.length, MAX_SEARCH_COLLECTION_STATUS_CANDIDATES);
  assert.equal(statuses.get("row-199")?.state, "not_recorded");
  assert.equal(statuses.get("row-200")?.state, "unavailable");
});

test("purged collection matches become historical and reuse only the matching Saved account", () => {
  const previousEncryptionKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "purge-history-status-test-key";

  try {
    const rows = [{
      id: "row-history",
      importId: "import-history",
      jsonDataJsonb: {
        IC: "900101015555",
        "Account No": "SOURCE-1001",
        "Card No": "COLLECTION-2002",
      },
    }];
    const candidates = buildSearchCollectionStatusCandidates(rows);
    const matchedAccountHash = candidates[0]?.accountHashes[1] || null;
    const statuses = buildSearchCollectionStatuses({
      rows,
      candidates,
      matches: [{
        rowId: "row-history",
        recordCount: 1,
        isHistorical: true,
        latestPaymentDate: "2025-12-15",
        latestCreatedAt: "2025-12-15T04:00:00.000Z",
        latestStaffNickname: "Collector History",
        latestCreatedByLogin: "collector.history",
        latestAccountNumber: null,
        matchedAccountHash,
        latestAmount: "99.90",
        sourceImportName: "Historical Source",
        sourceFilename: "historical.xlsx",
        purgedAt: "2026-08-05T05:00:00.000Z",
        purgedBy: "superuser.audit",
        matchBasis: "source_row",
      }],
      includeSourceDetails: true,
    });

    assert.deepEqual(statuses.get("row-history"), {
      state: "historical",
      recordCount: 1,
      latestPaymentDate: "2025-12-15",
      latestCreatedAt: "2025-12-15T04:00:00.000Z",
      latestStaffNickname: "Collector History",
      latestCreatedByLogin: "collector.history",
      latestAccountNumber: "COLLECTION-2002",
      latestAmount: "99.90",
      sourceImportName: "Historical Source",
      sourceFilename: "historical.xlsx",
      purgedAt: "2026-08-05T05:00:00.000Z",
      purgedBy: "superuser.audit",
      matchBasis: "source_row",
    });
  } finally {
    if (previousEncryptionKey === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previousEncryptionKey;
    }
  }
});
