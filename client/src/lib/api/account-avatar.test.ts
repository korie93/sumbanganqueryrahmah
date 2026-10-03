import assert from "node:assert/strict";
import test from "node:test";
import { updateAccountAvatar } from "./account-avatar";

const user = {
  id: "avatar-user", username: "avatar.user", role: "user", status: "active",
  fullName: null, email: null, createdAt: "2026-01-01T00:00:00.000Z",
  avatarUrl: `/api/me/avatar?v=${"a".repeat(24)}`,
  mustChangePassword: false, passwordResetBySuperuser: false, isBanned: false,
  twoFactorEnabled: false, twoFactorPendingSetup: false, twoFactorConfiguredAt: null,
  activatedAt: null, passwordChangedAt: null, lastLoginAt: null,
};
test("avatar update consumes the mutation contract without a session expiry field", async () => {
  const original = globalThis.fetch;
  const payload = { fileName: "avatar.png", mimeType: "image/png" as const, contentBase64: "cG5n" };
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/me/avatar");
    assert.equal(init?.method, "PUT");
    assert.equal(init?.credentials, "include");
    assert.equal(init?.body, JSON.stringify(payload));
    return Response.json({ ok: true, user });
  };
  try {
    const result = await updateAccountAvatar(payload, new AbortController().signal);
    assert.equal(result.avatarUrl, user.avatarUrl);
    assert.equal(result.createdAt, user.createdAt);
  } finally { globalThis.fetch = original; }
});
