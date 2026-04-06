import assert from "node:assert/strict";
import test from "node:test";
import {
  getManagedUserDeliveryPreviewUrl,
  normalizeManagedUserLifecycleTargetId,
  resolveManagedUserDeliveryRecipient,
  shouldOpenManagedUserSmtpPreview,
} from "@/pages/settings/settings-managed-user-lifecycle-utils";

test("normalizeManagedUserLifecycleTargetId trims blank identifiers", () => {
  assert.equal(normalizeManagedUserLifecycleTargetId("  user-1 "), "user-1");
  assert.equal(normalizeManagedUserLifecycleTargetId(""), "");
});

test("resolveManagedUserDeliveryRecipient prefers delivery recipient email", () => {
  assert.equal(
    resolveManagedUserDeliveryRecipient(
      { email: "fallback@example.com", username: "alice" } as never,
      "delivery@example.com",
    ),
    "delivery@example.com",
  );
});

test("resolveManagedUserDeliveryRecipient falls back to username when email is missing", () => {
  assert.equal(
    resolveManagedUserDeliveryRecipient(
      { email: "", username: "alice" } as never,
      null,
    ),
    "alice",
  );
});

test("shouldOpenManagedUserSmtpPreview only allows sent smtp previews", () => {
  assert.equal(
    shouldOpenManagedUserSmtpPreview({
      deliveryMode: "smtp",
      previewUrl: "https://preview.local",
      sent: true,
    }),
    true,
  );
  assert.equal(
    shouldOpenManagedUserSmtpPreview({
      deliveryMode: "dev_outbox",
      previewUrl: "https://preview.local",
      sent: true,
    }),
    false,
  );
});

test("getManagedUserDeliveryPreviewUrl trims preview urls", () => {
  assert.equal(getManagedUserDeliveryPreviewUrl("  https://preview.local  "), "https://preview.local");
});
