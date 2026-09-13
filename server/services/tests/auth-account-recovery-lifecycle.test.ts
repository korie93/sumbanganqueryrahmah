import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "../../../shared/error-codes";
import type { User } from "../../../shared/schema-postgres";
import { hashOpaqueToken, verifyPassword } from "../../auth/passwords";
import { AuthAccountActivationOperations } from "../auth-account-activation-operations";
import { AuthAccountPasswordResetOperations } from "../auth-account-password-reset-operations";
import type { AuthAccountRecoveryDeps } from "../auth-account-recovery-shared";
import { AuthAccountError } from "../auth-account-types";

type RecoveryKind = "activation" | "password_reset";
function harness(kind: RecoveryKind) {
  const rawToken = "fixture-recovery-link";
  const password = "FixturePassword12!";
  const user = { id: "fixture-user", username: "fixture.user", role: "user", isBanned: false,
    status: kind === "activation" ? "pending_activation" : "active", passwordHash: "old-fixture-hash",
    activatedAt: kind === "activation" ? null : new Date(), email: "fixture@example.test", fullName: "Fixture",
  } as User;
  const token = { tokenId: "fixture-token", requestId: "fixture-token", userId: user.id,
    expiresAt: new Date(Date.now() + 60_000), usedAt: null as Date | null, createdAt: new Date(),
  };
  let failSave = false;
  let lookupCount = 0;
  let saveCount = 0;
  const audits: unknown[] = [];
  const storage = {
    getActivationTokenRecordByHash: lookup,
    getPasswordResetTokenRecordByHash: lookup,
    completeAccountRecovery: async (input: Parameters<AuthAccountRecoveryDeps["storage"]["completeAccountRecovery"]>[0]) => {
      saveCount += 1;
      assert.equal(input.kind, kind);
      assert.equal(input.userId, user.id);
      assert.equal(input.tokenId, token.tokenId);
      assert.equal(input.tokenHash, hashOpaqueToken(rawToken));
      assert.equal(await verifyPassword(password, input.passwordHash), true);
      if (failSave) throw new Error("fixture transaction failed");
      if (token.usedAt) return undefined;
      token.usedAt = new Date();
      user.passwordHash = input.passwordHash;
      user.status = "active";
      user.activatedAt = new Date();
      return { user, lockCleared: false, closedSessionIds: [] };
    },
    createAuditLog: async (input: unknown) => { audits.push(input); },
  } as unknown as AuthAccountRecoveryDeps["storage"];
  async function lookup(hash: string) {
    lookupCount += 1;
    return hash === hashOpaqueToken(rawToken) ? { ...user, ...token } : undefined;
  }
  const deps = { storage, invalidateUserSessions: async () => [], requireManagedEmail: () => user.email! };
  const activation = new AuthAccountActivationOperations(deps);
  const reset = new AuthAccountPasswordResetOperations(deps);
  const submit = (overrides: Partial<{ username: string; token: string; newPassword: string; confirmPassword: string }> = {}) => {
    const input = { token: rawToken, newPassword: password, confirmPassword: password, ...overrides };
    return kind === "activation" ? activation.activateAccount(input) : reset.resetPasswordWithToken(input);
  };
  return { submit, token, user, password, audits, setFailSave(value: boolean) { failSave = value; },
    counts: () => ({ lookupCount, saveCount }) };
}

for (const kind of ["activation", "password_reset"] as const) {
  test(`${kind}: exact rule failures and mismatch reject before token lookup/save`, async () => {
    for (const [password, expected] of [
      ["Ab1!", ERROR_CODES.PASSWORD_TOO_SHORT],
      ["123456789012345!", ERROR_CODES.PASSWORD_MISSING_LETTER],
      ["fixturepassword12!", ERROR_CODES.PASSWORD_MISSING_UPPERCASE],
      ["FIXTUREPASSWORD12!", ERROR_CODES.PASSWORD_MISSING_LOWERCASE],
      ["FixturePassword!!", ERROR_CODES.PASSWORD_MISSING_NUMBER],
      ["FixturePassword12", ERROR_CODES.PASSWORD_MISSING_SYMBOL],
      ["Aa1!".repeat(65), ERROR_CODES.PASSWORD_TOO_LONG],
    ]) {
      const state = harness(kind);
      await assert.rejects(state.submit({ newPassword: password, confirmPassword: password }),
        (error: unknown) => error instanceof AuthAccountError && error.code === expected);
      assert.deepEqual(state.counts(), { lookupCount: 0, saveCount: 0 });
    }
    const state = harness(kind);
    await assert.rejects(state.submit({ confirmPassword: "DifferentPassword12!" }),
      (error: unknown) => error instanceof AuthAccountError && error.code === ERROR_CODES.PASSWORD_CONFIRMATION_MISMATCH);
    assert.deepEqual(state.counts(), { lookupCount: 0, saveCount: 0 });
  });

  test(`${kind}: invalid/expired links cannot reach password mutation`, async () => {
    const invalid = harness(kind);
    await assert.rejects(invalid.submit({ token: "nonexistent-fixture-link" }),
      (error: unknown) => error instanceof AuthAccountError && error.code === ERROR_CODES.INVALID_TOKEN);
    assert.equal(invalid.counts().saveCount, 0);
    const expired = harness(kind);
    expired.token.expiresAt = new Date(Date.now() - 1);
    await assert.rejects(expired.submit(),
      (error: unknown) => error instanceof AuthAccountError && error.code === ERROR_CODES.TOKEN_EXPIRED);
    assert.equal(expired.counts().saveCount, 0);
  });

  test(`${kind}: successful completion cannot be replayed`, async () => {
    const state = harness(kind);
    await state.submit();
    assert.equal(await verifyPassword(state.password, state.user.passwordHash), true);
    assert.ok(state.token.usedAt);
    assert.equal(state.audits.length, 1);
    await assert.rejects(state.submit(), (error: unknown) => error instanceof AuthAccountError
      && error.code === (kind === "activation" ? ERROR_CODES.ACCOUNT_ALREADY_ACTIVATED : ERROR_CODES.TOKEN_USED));
    assert.equal(state.counts().saveCount, 1);
    assert.equal(state.audits.length, 1);
  });

  test(`${kind}: failed persistence emits no success and a retry can still use the link`, async () => {
    const state = harness(kind);
    state.setFailSave(true);
    await assert.rejects(state.submit(), /fixture transaction failed/);
    assert.equal(state.user.passwordHash, "old-fixture-hash");
    assert.equal(state.token.usedAt, null);
    assert.equal(state.audits.length, 0);
    state.setFailSave(false);
    await state.submit();
    assert.equal(state.audits.length, 1);
  });
}

test("activation: superseded links and wrong optional username cannot activate another account", async () => {
  const superseded = harness("activation");
  superseded.token.usedAt = new Date();
  await assert.rejects(superseded.submit(),
    (error: unknown) => error instanceof AuthAccountError && error.code === ERROR_CODES.ACTIVATION_TOKEN_SUPERSEDED);
  assert.equal(superseded.counts().saveCount, 0);
  const wrongUsername = harness("activation");
  await assert.rejects(wrongUsername.submit({ username: "another.user" }),
    (error: unknown) => error instanceof AuthAccountError && error.code === ERROR_CODES.INVALID_TOKEN);
  assert.equal(wrongUsername.counts().saveCount, 0);
});
