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
    latestAmount: null,
    sourceImportName: null,
    sourceFilename: null,
    matchBasis: null,
  });
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
      latestAmount: "125.50",
      sourceImportName: "NPL CC P10 JULY",
      sourceFilename: "npl-cc-p10-july.xlsx",
      matchBasis: "source_and_identifier",
    },
  };

  const status = getGeneralSearchCollectionStatus(row);

  assert.equal(status.recordCount, 1_000_000);
  assert.equal(status.sourceImportName, "NPL CC P10 JULY");
  assert.equal(
    getGeneralSearchCollectionStatusAriaLabel(row),
    "Collection direkodkan, 1000000 rekod, disimpan oleh Collector Alpha, jumlah RM 125.50, tarikh bayaran 04/08/2026, direkod pada 04/08/2026, 10:00",
  );
});
