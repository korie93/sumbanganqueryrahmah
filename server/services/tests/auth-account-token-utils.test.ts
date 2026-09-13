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
  findOpaqueTokenRecordByHashCandidates,
} from "../auth-account-token-utils";
import { hashLegacyOpaqueToken } from "../../auth/passwords";
import { AuthAccountError } from "../auth-account-types";
import { ERROR_CODES } from "../../../shared/error-codes";

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

test("findOpaqueTokenRecordByHashCandidates preserves legacy token lookup compatibility", async () => {
  const rawToken = "legacy-token";
  const legacyHash = hashLegacyOpaqueToken(rawToken);
  const calls: string[] = [];

  const result = await findOpaqueTokenRecordByHashCandidates(rawToken, async (tokenHash) => {
    calls.push(tokenHash);
    return tokenHash === legacyHash ? { tokenId: "legacy-record" } : undefined;
  });

  assert.deepEqual(result, {
    record: { tokenId: "legacy-record" },
    tokenHash: legacyHash,
  });
  assert.equal(calls.includes(legacyHash), true);
});

test("assertConfirmedStrongPassword and assertStrongPasswordInput enforce shared password rules", () => {
  assert.doesNotThrow(() => assertConfirmedStrongPassword("StrongPass123!", "StrongPass123!"));
  assert.doesNotThrow(() => assertStrongPasswordInput("StrongPass123!"));

  const invalidPasswords = [
    ["Ab12345!", ERROR_CODES.PASSWORD_TOO_SHORT, /at least 14 characters/i],
    [`Aa1!${"a".repeat(253)}`, ERROR_CODES.PASSWORD_TOO_LONG, /must not exceed 256 characters/i],
    ["1234567890123!", ERROR_CODES.PASSWORD_MISSING_LETTER, /at least one letter/i],
    ["lowercasepass1!", ERROR_CODES.PASSWORD_MISSING_UPPERCASE, /uppercase letter/i],
    ["UPPERCASEPASS1!", ERROR_CODES.PASSWORD_MISSING_LOWERCASE, /lowercase letter/i],
    ["StrongPassword!", ERROR_CODES.PASSWORD_MISSING_NUMBER, /at least one number/i],
    ["StrongPassword1", ERROR_CODES.PASSWORD_MISSING_SYMBOL, /at least one symbol/i],
  ] as const;
  for (const [password, code, message] of invalidPasswords) {
    for (const validate of [
      () => assertStrongPasswordInput(password),
      () => assertConfirmedStrongPassword(password, password),
    ]) {
      assert.throws(validate, (error: unknown) => {
        assert.ok(error instanceof AuthAccountError);
        assert.equal(error.statusCode, 400);
        assert.equal(error.code, code);
        assert.match(error.message, message);
        assert.equal(error.message.includes(password), false, "Never echo the submitted password.");
        return true;
      });
    }
  }
  assert.throws(
    () => assertConfirmedStrongPassword("StrongPass123!", "StrongPass124!"),
    { code: ERROR_CODES.PASSWORD_CONFIRMATION_MISMATCH, statusCode: 400, message: "Passwords do not match." },
  );
  const maximumPassword = `Aa1!${"a".repeat(252)}`;
  assert.doesNotThrow(() => assertConfirmedStrongPassword(maximumPassword, maximumPassword));
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
    { code: ERROR_CODES.ACTIVATION_TOKEN_SUPERSEDED, statusCode: 410 },
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
    { code: ERROR_CODES.TOKEN_EXPIRED, statusCode: 410 },
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
    () => assertUsableActivationTokenRecord(undefined, now),
    { code: ERROR_CODES.INVALID_TOKEN, statusCode: 400 },
  );
  for (const usedAt of [null, "2026-03-15T09:30:00.000Z"]) {
    assert.throws(
      () => assertUsableActivationTokenRecord({
        ...usable,
        status: "active",
        activatedAt: "2026-03-15T09:30:00.000Z",
        usedAt,
      }, now),
      { code: ERROR_CODES.ACCOUNT_ALREADY_ACTIVATED, statusCode: 409 },
    );
  }
  for (const expiresAt of [now.toISOString(), "invalid timestamp"]) {
    assert.throws(
      () => assertUsableActivationTokenRecord({ ...usable, expiresAt }, now),
      { code: ERROR_CODES.TOKEN_EXPIRED, statusCode: 410 },
    );
  }
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
    { code: ERROR_CODES.TOKEN_USED, statusCode: 410 },
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
    { code: ERROR_CODES.TOKEN_EXPIRED, statusCode: 410 },
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
