import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionMonthDialogCacheKey,
  createCollectionMonthDialogCache,
  normalizeCollectionMonthDialogNicknames,
} from "@/pages/collection-summary/month-dialog-cache";
import type { CollectionRecord } from "@/lib/api/collection-types";

function createCollectionRecord(id: string): CollectionRecord {
  return {
    id,
    customerName: "",
    icNumber: "",
    customerPhone: "",
    accountNumber: "",
    batch: "P10",
    paymentDate: "2026-03-01",
    amount: "0.00",
    receiptFile: null,
    receipts: [],
    receiptTotalAmount: "0.00",
    receiptValidationStatus: "unverified",
    receiptValidationMessage: null,
    receiptCount: 0,
    duplicateReceiptFlag: false,
    createdByLogin: "super.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: "2026-03-01T00:00:00.000Z",
  };
}

test("normalizeCollectionMonthDialogNicknames dedupes and sorts filters", () => {
  assert.deepEqual(
    normalizeCollectionMonthDialogNicknames([
      " Collector Beta ",
      "collector alpha",
      "COLLECTOR BETA",
      "",
    ]),
    ["collector alpha", "collector beta"],
  );
});

test("buildCollectionMonthDialogCacheKey normalizes nickname ordering and casing", () => {
  const first = buildCollectionMonthDialogCacheKey({
    year: 2026,
    month: 3,
    page: 1,
    pageSize: 10,
    nicknames: ["Collector Beta", "collector alpha"],
  });
  const second = buildCollectionMonthDialogCacheKey({
    year: 2026,
    month: 3,
    page: 1,
    pageSize: 10,
    nicknames: [" collector alpha ", "COLLECTOR BETA"],
  });

  assert.equal(first, second);
});

test("createCollectionMonthDialogCache evicts the least-recently-used entry", () => {
  const cache = createCollectionMonthDialogCache(2);

  cache.set("page-1", { records: [createCollectionRecord("1")], totalRecords: 1 });
  cache.set("page-2", { records: [createCollectionRecord("2")], totalRecords: 1 });
  assert.equal(cache.size(), 2);

  const pageOne = cache.get("page-1");
  assert.equal(pageOne?.records[0]?.id, "1");

  cache.set("page-3", { records: [createCollectionRecord("3")], totalRecords: 1 });

  assert.equal(cache.get("page-2"), null);
  assert.equal(cache.get("page-1")?.records[0]?.id, "1");
  assert.equal(cache.get("page-3")?.records[0]?.id, "3");
});

test("createCollectionMonthDialogCache clear removes cached entries", () => {
  const cache = createCollectionMonthDialogCache(3);

  cache.set("page-1", { records: [createCollectionRecord("1")], totalRecords: 1 });
  cache.set("page-2", { records: [createCollectionRecord("2")], totalRecords: 1 });
  cache.clear();

  assert.equal(cache.size(), 0);
  assert.equal(cache.get("page-1"), null);
  assert.equal(cache.get("page-2"), null);
});
