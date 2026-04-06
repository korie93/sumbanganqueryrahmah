import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagedUserInsertRecord,
  buildUserAccountUpdateRecord,
  buildUserCredentialsUpdateRecord,
  deriveFailedLoginAttemptState,
} from "../auth-user-repository-shared";

test("auth user repository shared normalizes managed account inserts", () => {
  const now = new Date("2026-04-06T12:00:00.000Z");
  const record = buildManagedUserInsertRecord({
    id: "user-1",
    now,
    account: {
      username: "  Test.User  ",
      fullName: "  Test User  ",
      email: " TEST@EXAMPLE.COM ",
      role: "user",
      passwordHash: "hash-1",
      createdBy: "admin-1",
    },
  });

  assert.equal(record.username, "test.user");
  assert.equal(record.fullName, "Test User");
  assert.equal(record.email, "test@example.com");
  assert.equal(record.status, "pending_activation");
  assert.equal(record.createdAt, now);
});

test("auth user repository shared builds sparse credential and account updates", () => {
  const credentials = buildUserCredentialsUpdateRecord({
    userId: "user-1",
    newUsername: "  Updated.User ",
    mustChangePassword: true,
  });
  const account = buildUserAccountUpdateRecord({
    userId: "user-1",
    email: " USER@EXAMPLE.COM ",
    fullName: "  Updated User ",
    role: "admin",
    status: "disabled",
    lockedBySystem: true,
  });

  assert.equal(credentials.username, "updated.user");
  assert.equal(credentials.mustChangePassword, true);
  assert.equal(account.email, "user@example.com");
  assert.equal(account.fullName, "Updated User");
  assert.equal(account.role, "admin");
  assert.equal(account.status, "disabled");
  assert.equal(account.lockedBySystem, true);
});

test("auth user repository shared derives failed login lockout state", () => {
  const locked = deriveFailedLoginAttemptState({
    previousAttempts: 3,
    lockedAt: null,
    maxAllowedAttempts: 3,
    lockedReason: "too_many_failed_password_attempts",
    now: new Date("2026-04-06T12:00:00.000Z"),
  });
  const alreadyLocked = deriveFailedLoginAttemptState({
    previousAttempts: 1,
    lockedAt: new Date("2026-04-06T10:00:00.000Z"),
    maxAllowedAttempts: 3,
    lockedReason: "too_many_failed_password_attempts",
    now: new Date("2026-04-06T12:00:00.000Z"),
  });

  assert.equal(locked.nextAttempts, 4);
  assert.equal(locked.locked, true);
  assert.equal(locked.newlyLocked, true);
  assert.equal(locked.nextLockedReason, "too_many_failed_password_attempts");
  assert.ok(locked.nextLockedAt instanceof Date);

  assert.equal(alreadyLocked.locked, true);
  assert.equal(alreadyLocked.newlyLocked, false);
  assert.equal(
    (alreadyLocked.nextLockedAt as Date).toISOString(),
    "2026-04-06T10:00:00.000Z",
  );
});
