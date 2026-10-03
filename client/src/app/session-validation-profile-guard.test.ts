import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { User } from "@/app/types";
import { createSessionValidationProfileGuard } from "./session-validation-profile-guard";
import { createAccountProfilePatch } from "@/lib/account-profile";

const actor: User = {
  id: "session-actor", username: "operator", role: "admin", status: "active",
  mustChangePassword: false, twoFactorEnabled: false, twoFactorPendingSetup: false,
  twoFactorConfiguredAt: null, avatarUrl: null, createdAt: "2026-01-01T00:00:00.000Z",
  sessionExpiresAt: "2026-10-04T00:00:00.000Z",
};

test("session validation uses all authoritative profile fields when no newer mutation completed", () => {
  const guard = createSessionValidationProfileGuard(actor);
  const authoritative = { ...actor, twoFactorEnabled: true, avatarUrl: `/api/me/avatar?v=${"a".repeat(24)}` };
  assert.equal(guard.applyTo(authoritative), authoritative);
});

test("a delayed /me snapshot cannot reverse newer avatar or 2FA mutations", () => {
  const guard = createSessionValidationProfileGuard(actor);
  const avatarUrl = `/api/me/avatar?v=${"b".repeat(24)}`;
  guard.recordProfileUpdate(createAccountProfilePatch({ ...actor, avatarUrl }, "avatar"));
  guard.recordProfileUpdate(createAccountProfilePatch({ ...actor, twoFactorEnabled: true, twoFactorConfiguredAt: "2026-10-03T00:00:00.000Z" }, "two-factor"));
  const next = guard.applyTo(actor);
  assert.equal(next.avatarUrl, avatarUrl);
  assert.equal(next.twoFactorEnabled, true);
  assert.equal(next.twoFactorConfiguredAt, "2026-10-03T00:00:00.000Z");
});

test("avatar-only updates do not mask authoritative 2FA changes during a pending /me read", () => {
  const guard = createSessionValidationProfileGuard(actor);
  const avatarUrl = `/api/me/avatar?v=${"c".repeat(24)}`;
  guard.recordProfileUpdate(createAccountProfilePatch({ ...actor, avatarUrl }, "avatar"));
  const next = guard.applyTo({ ...actor, twoFactorEnabled: true, twoFactorConfiguredAt: "2026-10-03T02:00:00.000Z" });
  assert.equal(next.avatarUrl, avatarUrl);
  assert.equal(next.twoFactorEnabled, true);
  assert.equal(next.twoFactorConfiguredAt, "2026-10-03T02:00:00.000Z");
});

test("2FA-only updates do not mask authoritative avatar changes during a pending /me read", () => {
  const guard = createSessionValidationProfileGuard(actor);
  const avatarUrl = `/api/me/avatar?v=${"d".repeat(24)}`;
  guard.recordProfileUpdate(createAccountProfilePatch({ ...actor, twoFactorEnabled: true }, "two-factor"));
  const next = guard.applyTo({ ...actor, avatarUrl, createdAt: "2026-02-01T00:00:00.000Z" });
  assert.equal(next.twoFactorEnabled, true);
  assert.equal(next.avatarUrl, avatarUrl);
  assert.equal(next.createdAt, "2026-02-01T00:00:00.000Z");
});

test("newer personal fields never override authoritative role, identity, ban or forced password gate", () => {
  const guard = createSessionValidationProfileGuard(actor);
  guard.recordProfileUpdate({ ...actor, role: "superuser", status: "active", email: "changed@example.test", mustChangePassword: false, twoFactorEnabled: true });
  const next = guard.applyTo({ ...actor, role: "user", status: "disabled", isBanned: true, mustChangePassword: true, email: "original@example.test" });
  assert.equal(next.role, "user");
  assert.equal(next.status, "disabled");
  assert.equal(next.isBanned, true);
  assert.equal(next.mustChangePassword, true);
  assert.equal(next.email, "original@example.test");
  assert.equal(next.twoFactorEnabled, true);
});

test("profile races from other actors or sessions cannot be carried into session validation", () => {
  for (const wrongIdentity of [{ id: "other" }, { username: "other" }, { sessionExpiresAt: "2026-10-05T00:00:00.000Z" }]) {
    const guard = createSessionValidationProfileGuard(actor);
    guard.recordProfileUpdate({ ...actor, ...wrongIdentity, twoFactorEnabled: true });
    assert.equal(guard.applyTo(actor), actor);
  }
  const guard = createSessionValidationProfileGuard(actor);
  guard.recordProfileUpdate({ ...actor, twoFactorEnabled: true });
  const otherActor = { ...actor, id: "other" };
  assert.equal(guard.applyTo(otherActor), otherActor);
});

test("session validation observes profile events only while its read is pending and cleans up", () => {
  const source = readFileSync(new URL("./useAppShellSessionValidation.ts", import.meta.url), "utf8");
  assert.match(source, /readPending && !cancelled/);
  assert.match(source, /profileGuard.applyTo\(\{/);
  assert.match(source, /finally \{\s*readPending = false;\s*window.removeEventListener\("profile-updated", onProfileUpdated\)/);
  assert.match(source, /cancelled = true;\s*readPending = false;/);
});
