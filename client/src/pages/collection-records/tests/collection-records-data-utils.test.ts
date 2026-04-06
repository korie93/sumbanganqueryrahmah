import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionRecordsPaginationState,
  clampCollectionRecordsPageSize,
  DEFAULT_COLLECTION_RECORDS_PAGE_SIZE,
  MAX_COLLECTION_RECORDS_PAGE_SIZE,
} from "@/pages/collection-records/collection-records-data-utils";

test("clampCollectionRecordsPageSize keeps page size within supported bounds", () => {
  assert.equal(clampCollectionRecordsPageSize(0), 1);
  assert.equal(clampCollectionRecordsPageSize(DEFAULT_COLLECTION_RECORDS_PAGE_SIZE), DEFAULT_COLLECTION_RECORDS_PAGE_SIZE);
  assert.equal(clampCollectionRecordsPageSize(MAX_COLLECTION_RECORDS_PAGE_SIZE + 50), MAX_COLLECTION_RECORDS_PAGE_SIZE);
  assert.equal(clampCollectionRecordsPageSize(42.9), 42);
});

test("buildCollectionRecordsPaginationState derives visible range and navigation flags", () => {
  assert.deepEqual(
    buildCollectionRecordsPaginationState({
      totalRecords: 125,
      page: 2,
      pageSize: 50,
      recordsLength: 50,
    }),
    {
      pageOffset: 50,
      pagedStart: 51,
      pagedEnd: 100,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    },
  );

  assert.deepEqual(
    buildCollectionRecordsPaginationState({
      totalRecords: 0,
      page: 1,
      pageSize: 50,
      recordsLength: 0,
    }),
    {
      pageOffset: 0,
      pagedStart: 0,
      pagedEnd: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  );
});
