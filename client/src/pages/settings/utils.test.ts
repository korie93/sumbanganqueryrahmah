import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsMutationErrorToast,
  normalizeSettingsErrorPayload,
} from "@/pages/settings/utils";

test("normalizeSettingsErrorPayload reads structured settings errors", () => {
  const error = new Error(
    '400: {"error":{"code":"INVALID_EMAIL","message":"Email address is invalid."},"requiresConfirmation":true}',
  );

  assert.deepEqual(normalizeSettingsErrorPayload(error), {
    code: "INVALID_EMAIL",
    message: "Email address is invalid.",
    requiresConfirmation: true,
  });
});

test("buildSettingsMutationErrorToast uses parsed settings error details", () => {
  const error = new Error(
    '409: {"error":{"code":"USERNAME_TAKEN","message":"Username is already in use."}}',
  );

  assert.deepEqual(buildSettingsMutationErrorToast(error, "Create Failed"), {
    title: "USERNAME_TAKEN",
    description: "Username is already in use.",
    variant: "destructive",
  });
});

test("buildSettingsMutationErrorToast falls back when the error is unstructured", () => {
  const error = new Error("Network request failed");

  assert.deepEqual(buildSettingsMutationErrorToast(error, "Update Failed"), {
    title: "Update Failed",
    description: "Network request failed",
    variant: "destructive",
  });
});
