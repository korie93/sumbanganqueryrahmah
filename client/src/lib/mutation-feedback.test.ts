import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
  resolveMutationErrorMessage,
} from "@/lib/mutation-feedback";

test("resolveMutationErrorMessage appends backend request ids for support correlation", () => {
  const message = resolveMutationErrorMessage(
    new Error('500: {"message":"Backup failed unexpectedly","requestId":"req-backup-500"}'),
  );

  assert.match(message, /Backup failed unexpectedly/);
  assert.match(message, /req-backup-500/);
});

test("buildMutationErrorToast keeps destructive styling and derived request references", () => {
  const toast = buildMutationErrorToast({
    title: "Restore Failed",
    error: new Error('500: {"message":"Restore failed unexpectedly","requestId":"req-restore-500"}'),
  });

  assert.equal(toast.title, "Restore Failed");
  assert.equal(toast.variant, "destructive");
  assert.match(String(toast.description), /req-restore-500/);
});

test("buildMutationSuccessToast preserves success metadata", () => {
  const toast = buildMutationSuccessToast({
    title: "Saved",
    description: "Changes were stored safely.",
    duration: 4000,
  });

  assert.equal(toast.title, "Saved");
  assert.equal(toast.variant, "default");
  assert.equal(toast.duration, 4000);
});
