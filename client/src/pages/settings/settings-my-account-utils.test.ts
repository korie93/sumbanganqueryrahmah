import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("buildNextCurrentUser clears the configured date after authoritative disable or fresh setup", () => {
  const currentUser = { ...createCurrentUser(), twoFactorEnabled: true, twoFactorConfiguredAt: "2026-09-01T00:00:00.000Z" };
  for (const pending of [false, true]) {
    const next = buildNextCurrentUser(currentUser, currentUser.username, {
      user: { ...currentUser, twoFactorEnabled: false, twoFactorPendingSetup: pending, twoFactorConfiguredAt: null },
    });
    assert.equal(next.twoFactorConfiguredAt, null);
    assert.equal(next.twoFactorEnabled, false);
    assert.equal(next.twoFactorPendingSetup, pending);
  }
  assert.equal(buildNextCurrentUser(currentUser, currentUser.username, { user: null }).twoFactorConfiguredAt, currentUser.twoFactorConfiguredAt);
});

test("canConfigureTwoFactor only allows admin and superuser", () => {
  assert.equal(canConfigureTwoFactor("admin"), true);
  assert.equal(canConfigureTwoFactor("superuser"), true);
  assert.equal(canConfigureTwoFactor("user"), false);
  assert.equal(canConfigureTwoFactor("manager"), false);
});

test("2FA synchronization preserves current profile metadata and accepts authoritative avatar removal", () => {
  const current = { ...createCurrentUser(), createdAt: "2026-01-01T00:00:00.000Z", avatarUrl: "/api/me/avatar?v=fixture" };
  const next = buildNextCurrentUser(current, current.username, { user: { ...createCurrentUser(), twoFactorEnabled: true } });
  assert.equal(next.avatarUrl, current.avatarUrl);
  assert.equal(next.createdAt, current.createdAt);
  assert.equal(next.twoFactorEnabled, true);
  assert.equal(buildNextCurrentUser(current, current.username, { user: { ...current, avatarUrl: null } }).avatarUrl, null);
});

test("Security scopes profile synchronization to 2FA so response snapshots cannot roll back avatar fields", () => {
  const source = readFileSync(new URL("./settings-my-account-utils.ts", import.meta.url), "utf8");
  assert.match(source, /syncAccountProfile\(nextUser, "two-factor"\)/);
});
