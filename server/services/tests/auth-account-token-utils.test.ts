import assert from "node:assert/strict";
import test from "node:test";
import { addHours } from "date-fns";
import {
  assertConfirmedStrongPassword,
  assertStrongPasswordInput,
  assertUsableActivationTokenRecord,
  assertUsablePasswordResetTokenRecord,
  createActivationTokenPayload,
  createPasswordResetTokenPayload,
} from "../auth-account-token-utils";

test("createActivationTokenPayload and createPasswordResetTokenPayload set the expected expiry windows", () => {
  const now = new Date("2026-03-15T10:00:00.000Z");

  const activation = createActivationTokenPayload(now);
  const reset = createPasswordResetTokenPayload(now);

  assert.ok(activation.token);
  assert.ok(activation.tokenHash);
  assert.equal(activation.expiresAt.toISOString(), addHours(now, 24).toISOString());

  assert.ok(reset.token);
  assert.ok(reset.tokenHash);
  assert.equal(reset.expiresAt.toISOString(), addHours(now, 4).toISOString());
});

test("assertConfirmedStrongPassword and assertStrongPasswordInput enforce shared password rules", () => {
  assert.doesNotThrow(() => assertConfirmedStrongPassword("StrongPass123", "StrongPass123"));
  assert.doesNotThrow(() => assertStrongPasswordInput("StrongPass123"));

  assert.throws(
    () => assertConfirmedStrongPassword("weak", "weak"),
    /Password must be at least 8 characters/i,
  );
  assert.throws(
    () => assertConfirmedStrongPassword("StrongPass123", "StrongPass124"),
    /Confirm password does not match/i,
  );
  assert.throws(
    () => assertStrongPasswordInput("weak"),
    /Password must be at least 8 characters/i,
  );
});

test("assertUsableActivationTokenRecord normalizes dates and rejects unsafe activation states", () => {
  const now = new Date("2026-03-15T10:00:00.000Z");

  const usable = assertUsableActivationTokenRecord(
    {
      tokenId: "token-1",
      userId: "user-1",
      username: "managed.user",
      fullName: "Managed User",
      email: "managed@example.com",
      role: "admin",
      status: "pending_activation",
      isBanned: false,
      activatedAt: null,
      expiresAt: "2026-03-16T10:00:00.000Z",
      usedAt: null,
      createdAt: new Date("2026-03-15T09:00:00.000Z"),
    },
    now,
  );

  assert.equal(usable.expiresAt.toISOString(), "2026-03-16T10:00:00.000Z");

  assert.throws(
    () =>
      assertUsableActivationTokenRecord(
        {
          ...usable,
          usedAt: "2026-03-15T09:30:00.000Z",
        },
        now,
      ),
    /already been used/i,
  );
  assert.throws(
    () =>
      assertUsableActivationTokenRecord(
        {
          ...usable,
          expiresAt: "2026-03-15T09:59:59.000Z",
        },
        now,
      ),
    /expired/i,
  );
  assert.throws(
    () =>
      assertUsableActivationTokenRecord(
        {
          ...usable,
          isBanned: true,
        },
        now,
      ),
    /not available for this account/i,
  );
  assert.throws(
    () =>
      assertUsableActivationTokenRecord(
        {
          ...usable,
          status: "active",
        },
        now,
      ),
    /no longer available/i,
  );
  assert.throws(
    () =>
      assertUsableActivationTokenRecord(
        {
          ...usable,
          role: "superuser",
        },
        now,
      ),
    /not available for this account/i,
  );
});

test("assertUsablePasswordResetTokenRecord rejects used, expired, pending, and unmanaged roles", () => {
  const now = new Date("2026-03-15T10:00:00.000Z");

  const usable = assertUsablePasswordResetTokenRecord(
    {
      requestId: "request-1",
      userId: "user-1",
      username: "managed.user",
      fullName: "Managed User",
      email: "managed@example.com",
      role: "user",
      status: "active",
      isBanned: false,
      activatedAt: new Date("2026-03-10T10:00:00.000Z"),
      expiresAt: "2026-03-15T12:00:00.000Z",
      usedAt: null,
      createdAt: new Date("2026-03-15T09:00:00.000Z"),
    },
    now,
  );

  assert.equal(usable.expiresAt.toISOString(), "2026-03-15T12:00:00.000Z");

  assert.throws(
    () =>
      assertUsablePasswordResetTokenRecord(
        {
          ...usable,
          usedAt: "2026-03-15T09:30:00.000Z",
        },
        now,
      ),
    /already been used/i,
  );
  assert.throws(
    () =>
      assertUsablePasswordResetTokenRecord(
        {
          ...usable,
          expiresAt: "2026-03-15T09:59:59.000Z",
        },
        now,
      ),
    /expired/i,
  );
  assert.throws(
    () =>
      assertUsablePasswordResetTokenRecord(
        {
          ...usable,
          status: "pending_activation",
        },
        now,
      ),
    /must complete activation/i,
  );
  assert.throws(
    () =>
      assertUsablePasswordResetTokenRecord(
        {
          ...usable,
          role: "superuser",
        },
        now,
      ),
    /not available for this account/i,
  );
});

test("auth token helpers treat database timestamps without timezone as UTC", () => {
  const now = new Date("2026-03-30T13:54:00.000Z");

  const reset = assertUsablePasswordResetTokenRecord(
    {
      requestId: "request-utc-1",
      userId: "user-utc-1",
      username: "utc.user",
      fullName: "UTC User",
      email: "utc.user@example.com",
      role: "user",
      status: "active",
      isBanned: false,
      activatedAt: "2026-03-29 09:00:00",
      expiresAt: "2026-03-30 17:54:00",
      usedAt: null,
      createdAt: "2026-03-30 09:54:00",
    },
    now,
  );

  const activation = assertUsableActivationTokenRecord(
    {
      tokenId: "token-utc-1",
      userId: "user-utc-1",
      username: "utc.user",
      fullName: "UTC User",
      email: "utc.user@example.com",
      role: "user",
      status: "pending_activation",
      isBanned: false,
      activatedAt: null,
      expiresAt: "2026-03-30 17:54:00",
      usedAt: null,
      createdAt: "2026-03-30 09:54:00",
    },
    now,
  );

  assert.equal(reset.expiresAt.toISOString(), "2026-03-30T17:54:00.000Z");
  assert.equal(reset.activatedAt?.toISOString(), "2026-03-29T09:00:00.000Z");
  assert.equal(reset.createdAt.toISOString(), "2026-03-30T09:54:00.000Z");
  assert.equal(activation.expiresAt.toISOString(), "2026-03-30T17:54:00.000Z");
  assert.equal(activation.createdAt.toISOString(), "2026-03-30T09:54:00.000Z");
});
