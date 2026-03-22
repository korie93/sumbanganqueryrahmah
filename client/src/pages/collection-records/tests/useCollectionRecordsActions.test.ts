import test from "node:test";
import assert from "node:assert/strict";
import { buildDeleteRecordErrorFeedback } from "@/pages/collection-records/useCollectionRecordsActions";

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
