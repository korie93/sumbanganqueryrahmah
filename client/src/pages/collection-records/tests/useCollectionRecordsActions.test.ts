import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeleteRecordErrorFeedback,
  resolveCollectionRecordsExportBlockReason,
} from "@/pages/collection-records/useCollectionRecordsActions";

test("buildDeleteRecordErrorFeedback maps stale record conflicts to the refresh guidance toast", () => {
  const feedback = buildDeleteRecordErrorFeedback(
    new Error(
      '409: {"ok":false,"message":"Collection record has changed since you opened it. Refresh and try again.","error":{"code":"COLLECTION_RECORD_VERSION_CONFLICT","message":"Collection record has changed since you opened it. Refresh and try again."}}',
    ),
  );

  assert.equal(feedback.isVersionConflict, true);
  assert.equal(feedback.title, "Record Updated Elsewhere");
  assert.match(feedback.description, /reopen the record and try again/i);
});

test("buildDeleteRecordErrorFeedback keeps non-conflict delete failures generic", () => {
  const feedback = buildDeleteRecordErrorFeedback(
    new Error('500: {"ok":false,"message":"Delete failed unexpectedly."}'),
  );

  assert.equal(feedback.isVersionConflict, false);
  assert.equal(feedback.title, "Failed to Delete Record");
  assert.equal(feedback.description, "Delete failed unexpectedly.");
});

test("resolveCollectionRecordsExportBlockReason prioritizes empty exports", () => {
  assert.equal(
    resolveCollectionRecordsExportBlockReason({
      totalRecords: 0,
      exportingExcel: false,
      exportingPdf: false,
    }),
    "no_data",
  );
});

test("resolveCollectionRecordsExportBlockReason blocks concurrent exports", () => {
  assert.equal(
    resolveCollectionRecordsExportBlockReason({
      totalRecords: 10,
      exportingExcel: true,
      exportingPdf: false,
    }),
    "busy",
  );
  assert.equal(
    resolveCollectionRecordsExportBlockReason({
      totalRecords: 10,
      exportingExcel: false,
      exportingPdf: true,
    }),
    "busy",
  );
});

test("resolveCollectionRecordsExportBlockReason allows exports when data is ready", () => {
  assert.equal(
    resolveCollectionRecordsExportBlockReason({
      totalRecords: 10,
      exportingExcel: false,
      exportingPdf: false,
    }),
    null,
  );
});
