import assert from "node:assert/strict";
import test from "node:test";
import {
  getGeneralSearchCollectionStatus,
  getGeneralSearchCollectionStatusAriaLabel,
} from "./collection-status";

test("collection status parser rejects malformed payloads safely", () => {
  const status = getGeneralSearchCollectionStatus({
    _collectionStatus: "unexpected",
  });

  assert.deepEqual(status, {
    state: "unavailable",
    recordCount: 0,
    latestPaymentDate: null,
    latestCreatedAt: null,
    latestStaffNickname: null,
    latestCreatedByLogin: null,
    latestAccountNumber: null,
    latestAmount: null,
    sourceImportName: null,
    sourceFilename: null,
    purgedAt: null,
    purgedBy: null,
    matchBasis: null,
    historyKey: null,
  });
});

test("collection status parser and aria label distinguish purged history", () => {
  const row = {
    _collectionStatus: {
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
    },
  };

  const status = getGeneralSearchCollectionStatus(row);
  assert.equal(status.state, "historical");
  assert.equal(status.purgedBy, "superuser.audit");
  assert.match(getGeneralSearchCollectionStatusAriaLabel(row), /Rekod sejarah collection/);
  assert.match(getGeneralSearchCollectionStatusAriaLabel(row), /dipurge oleh superuser\.audit/);
});

test("collection status parser bounds count and text from the API", () => {
  const row = {
    _collectionStatus: {
      state: "recorded",
      recordCount: Number.MAX_SAFE_INTEGER,
      latestPaymentDate: "2026-08-04",
      latestCreatedAt: "2026-08-04T02:00:00.000Z",
      latestStaffNickname: "Collector Alpha",
      latestCreatedByLogin: "collector.login",
      latestAccountNumber: "ACC-1001-VERY-LONG",
      latestAmount: "125.50",
      sourceImportName: "NPL CC P10 JULY",
      sourceFilename: "npl-cc-p10-july.xlsx",
      matchBasis: "source_and_identifier",
      historyKey: `sch1.${"x".repeat(1_100)}`,
    },
  };

  const status = getGeneralSearchCollectionStatus(row);

  assert.equal(status.recordCount, 1_000_000);
  assert.equal(status.latestAccountNumber, "ACC-1001-VERY-LONG");
  assert.equal(status.sourceImportName, "NPL CC P10 JULY");
  assert.equal(status.historyKey?.length, 1_024);
  assert.equal(
    getGeneralSearchCollectionStatusAriaLabel(row),
    "Collection direkodkan, 1000000 rekod, disimpan oleh Collector Alpha, nombor akaun ACC-1001-VERY-LONG, jumlah RM 125.50, tarikh bayaran 04/08/2026, direkod pada 04/08/2026, 10:00",
  );
});
