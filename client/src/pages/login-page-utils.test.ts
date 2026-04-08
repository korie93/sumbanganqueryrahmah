import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthenticatedUser,
  hasLoginFieldErrors,
  isAbortRequestError,
  isLockedAccountError,
  normalizeLoginErrorMessage,
  readErrorMessage,
  resolveAuthenticatedDefaultTab,
  validatePasswordLoginFields,
  validateTwoFactorCodeField,
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

test("login error helpers read safe fields from unknown errors", () => {
  assert.equal(isLockedAccountError({ code: "ACCOUNT_LOCKED" }), true);
  assert.equal(isLockedAccountError({ locked: true }), true);
  assert.equal(isLockedAccountError({ code: "OTHER" }), false);

  assert.equal(readErrorMessage(new Error("Boom"), "Fallback"), "Boom");
  assert.equal(readErrorMessage({ message: "Plain object error" }, "Fallback"), "Plain object error");
  assert.equal(readErrorMessage({ message: "" }, "Fallback"), "Fallback");
});

test("login field validation flags missing username/password and incomplete 2FA codes", () => {
  assert.deepEqual(validatePasswordLoginFields("", ""), {
    username: "Sila masukkan username.",
    password: "Sila masukkan password.",
  });
  assert.equal(hasLoginFieldErrors(validatePasswordLoginFields("operator", "secret")), false);
  assert.deepEqual(validateTwoFactorCodeField("12"), {
    twoFactorCode: "Sila masukkan kod pengesah 6 digit.",
  });
  assert.equal(hasLoginFieldErrors(validateTwoFactorCodeField("123456")), false);
});
