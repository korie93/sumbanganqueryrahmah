import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNextCurrentUser,
  canConfigureTwoFactor,
  normalizeAuthenticatorCode,
} from "@/pages/settings/settings-my-account-utils";
import type { CurrentUser } from "@/pages/settings/types";

function createCurrentUser(): CurrentUser {
  return {
    id: "user-1",
    username: "alice",
    fullName: "Alice",
    email: "alice@example.com",
    role: "admin",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    twoFactorEnabled: false,
    twoFactorPendingSetup: false,
    twoFactorConfiguredAt: null,
  };
}

test("buildNextCurrentUser keeps fallback username when response user is missing", () => {
  const currentUser = createCurrentUser();

  assert.deepEqual(
    buildNextCurrentUser(currentUser, "normalized-user", { user: null }),
    {
      ...currentUser,
      username: "normalized-user",
    },
  );
});

test("buildNextCurrentUser prefers response flags when available", () => {
  const currentUser = createCurrentUser();

  assert.deepEqual(
    buildNextCurrentUser(currentUser, currentUser.username, {
      user: {
        ...currentUser,
        twoFactorEnabled: true,
        twoFactorPendingSetup: true,
        twoFactorConfiguredAt: "2026-04-06T10:00:00.000Z",
      },
    }),
    {
      ...currentUser,
      twoFactorEnabled: true,
      twoFactorPendingSetup: true,
      twoFactorConfiguredAt: "2026-04-06T10:00:00.000Z",
    },
  );
});

test("normalizeAuthenticatorCode strips non-digits and limits to six digits", () => {
  assert.equal(normalizeAuthenticatorCode("12a3 45678"), "123456");
});

test("canConfigureTwoFactor only allows admin and superuser", () => {
  assert.equal(canConfigureTwoFactor("admin"), true);
  assert.equal(canConfigureTwoFactor("superuser"), true);
  assert.equal(canConfigureTwoFactor("user"), false);
});
