import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
  resolveMutationErrorDetails,
  resolveMutationErrorMessage,
} from "@/lib/mutation-feedback";

test("resolveMutationErrorDetails separates safe request ids from user-facing messages", () => {
  const details = resolveMutationErrorDetails(
    new Error('500: {"message":"Backup failed unexpectedly","requestId":"req-backup-500"}'),
  );

  assert.equal(details.message, "Backup failed unexpectedly");
  assert.equal(details.requestId, "req-backup-500");
});

test("buildMutationErrorToast keeps destructive styling and derived request references", () => {
  const toast = buildMutationErrorToast({
    title: "Restore Failed",
    error: new Error('500: {"message":"Restore failed unexpectedly","requestId":"req-restore-500"}'),
  });

  assert.equal(toast.title, "Restore Failed");
  assert.equal(toast.variant, "destructive");
  assert.equal(toast.description, "Restore failed unexpectedly");
  assert.equal(toast.requestId, "req-restore-500");
});

test("resolveMutationErrorMessage replaces generic failures with status guidance", () => {
  const message = resolveMutationErrorMessage(
    new Error('429: {"message":"Request failed","retryAfterMs":2500}'),
  );

  assert.match(message, /Terlalu banyak percubaan/);
  assert.doesNotMatch(message, /^Request failed/);
});

test("buildMutationSuccessToast preserves success metadata", () => {
  const toast = buildMutationSuccessToast({
    title: "Saved",
    description: "Changes were stored safely.",
    duration: 4000,
  });

  assert.equal(toast.title, "Saved");
  assert.equal(toast.variant, "success");
  assert.equal(toast.duration, 4000);
});
