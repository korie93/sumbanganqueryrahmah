import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionRecordsPaginationControlsState } from "@/pages/collection-records/collection-records-toolbar-utils";

test("buildCollectionRecordsPaginationControlsState disables page controls while records load", () => {
  assert.deepEqual(
    buildCollectionRecordsPaginationControlsState({
      hasNextPage: true,
      hasPreviousPage: true,
      loadingRecords: true,
    }),
    {
      nextDisabled: true,
      pageSizeDisabled: true,
      paginationBusy: true,
      previousDisabled: true,
    },
  );
});

test("buildCollectionRecordsPaginationControlsState keeps boundary controls disabled when idle", () => {
  assert.deepEqual(
    buildCollectionRecordsPaginationControlsState({
      hasNextPage: true,
      hasPreviousPage: false,
      loadingRecords: false,
    }),
    {
      nextDisabled: false,
      pageSizeDisabled: false,
      paginationBusy: false,
      previousDisabled: true,
    },
  );
});
