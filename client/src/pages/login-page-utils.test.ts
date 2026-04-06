import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthenticatedUser,
  isAbortRequestError,
  normalizeLoginErrorMessage,
  resolveAuthenticatedDefaultTab,
} from "./login-page-utils";

test("buildAuthenticatedUser prefers nested user fields and normalizes username casing", () => {
  const user = buildAuthenticatedUser({
    ok: true,
    username: "Operator",
    role: "user",
    activityId: "activity-1",
    mustChangePassword: false,
    status: "active",
    user: {
      id: "user-1",
      username: "ADMIN.USER",
      fullName: "Admin User",
      email: "admin@example.com",
      role: "superuser",
      status: "active",
      mustChangePassword: true,
      passwordResetBySuperuser: true,
      isBanned: false,
      twoFactorEnabled: true,
      twoFactorPendingSetup: false,
      twoFactorConfiguredAt: "2026-04-06T00:00:00.000Z",
    },
  });

  assert.equal(user.username, "admin.user");
  assert.equal(user.role, "superuser");
  assert.equal(user.mustChangePassword, true);
  assert.equal(user.passwordResetBySuperuser, true);
  assert.equal(user.twoFactorEnabled, true);
});

test("resolveAuthenticatedDefaultTab honors password-change and role priorities", () => {
  assert.equal(resolveAuthenticatedDefaultTab({ role: "user", mustChangePassword: true }), "change-password");
  assert.equal(resolveAuthenticatedDefaultTab({ role: "admin", mustChangePassword: false }), "home");
  assert.equal(resolveAuthenticatedDefaultTab({ role: "user", mustChangePassword: false }), "general-search");
});

test("normalizeLoginErrorMessage rewrites banned-account messages", () => {
  assert.equal(
    normalizeLoginErrorMessage('Account is banned {"banned":true}'),
    "Your account has been banned. Please contact administrator.",
  );
  assert.equal(normalizeLoginErrorMessage("Plain login failure"), "Plain login failure");
});

test("isAbortRequestError detects AbortError DOMExceptions", () => {
  assert.equal(isAbortRequestError(new DOMException("Request aborted", "AbortError")), true);
  assert.equal(isAbortRequestError(new Error("Other error")), false);
});
