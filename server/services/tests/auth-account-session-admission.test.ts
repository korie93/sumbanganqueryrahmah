import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "../../auth/passwords";
import { buildTwoFactorCredentialState } from "../../auth/two-factor";
import type { ActivityAdmissionExpectation } from "../../auth/session-admission";
import { AuthAccountAuthenticationOperations } from "../auth-account-authentication-operations";
import { AuthAccountError } from "../auth-account-types";

type Storage = ConstructorParameters<typeof AuthAccountAuthenticationOperations>[0]["storage"];
type User = NonNullable<Awaited<ReturnType<Storage["getUser"]>>>;
const password = "Session-admission-test-123!";
let passwordHash: string;
test.before(async () => { passwordHash = await hashPassword(password); });

function fixture(changesAfterVerification: Partial<User> = {}, factorEnabled = false) {
  const verifiedUser = {
    id: "session-admission-user", username: "admission.user", role: "user", status: "active",
    passwordHash, failedLoginAttempts: 1, lockedAt: null, lockedBySystem: false,
    isBanned: false, twoFactorEnabled: factorEnabled, twoFactorSecretEncrypted: null,
  } as User;
  const expectations: Array<ActivityAdmissionExpectation | undefined> = [];
  const audits: string[] = [];
  const storage = {
    getUserByUsername: async () => ({ ...verifiedUser }),
    isVisitorBanned: async () => false,
    updateUserAccount: async () => ({ ...verifiedUser, failedLoginAttempts: 0, ...changesAfterVerification }),
    getActiveActivitiesByUsername: async () => [],
    deactivateUserActivities: async () => undefined,
    createActivity: async (_data: unknown, expected: ActivityAdmissionExpectation | undefined) => {
      expectations.push(expected);
      return { id: "admitted-activity" };
    },
    touchLastLogin: async () => undefined,
    createAuditLog: async (entry: { action: string }) => { audits.push(entry.action); return {}; },
  } as unknown as Storage;
  return {
    verifiedUser, expectations, audits,
    authentication: new AuthAccountAuthenticationOperations({ storage }),
  };
}

test("password login always passes proof built from the password-verified snapshot", async () => {
  const f = fixture();
  const result = await f.authentication.login({
    username: f.verifiedUser.username, password, browserName: "Fixture browser",
    // A caller-supplied expectation is never used by normal login.
    ...{ expectedAdmission: { kind: "password", credentialState: "untrusted" } },
  });
  assert.equal(result.kind, "authenticated");
  assert.deepEqual(f.expectations, [{
    kind: "password", credentialState: buildTwoFactorCredentialState(f.verifiedUser),
  }]);
});

test("failed-attempt cleanup cannot replace the password proof with a newer account row", async (t) => {
  for (const [name, changes, enabled] of [
    ["password reset", { passwordHash: "concurrent-reset-hash" }, false],
    ["identity change", { username: "renamed.user" }, false],
    ["role change", { role: "superuser" }, false],
    ["factor secret change", { twoFactorSecretEncrypted: "new-secret" }, false],
    ["factor enabled", { twoFactorEnabled: true }, false],
    ["factor disabled", { twoFactorEnabled: false }, true],
    ["password reset before MFA challenge", { passwordHash: "concurrent-reset-hash" }, true],
  ] as const) {
    await t.test(name, async () => {
      const f = fixture(changes, enabled);
      await assert.rejects(f.authentication.login({
        username: f.verifiedUser.username, password, browserName: "Fixture browser",
      }), (error: unknown) => {
        assert.ok(error instanceof AuthAccountError);
        assert.equal(error.code, "INVALID_CREDENTIALS");
        return true;
      });
      assert.deepEqual(f.expectations, []);
      assert.equal(f.audits.includes("LOGIN_SECOND_FACTOR_REQUIRED"), false);
      assert.equal(f.audits.includes("LOGIN_SUCCESS"), false);
    });
  }
});

test("an unchanged enabled factor continues to require a second factor without admitting a session", async () => {
  const f = fixture({}, true);
  const result = await f.authentication.login({
    username: f.verifiedUser.username, password, browserName: "Fixture browser",
  });
  assert.equal(result.kind, "two_factor_required");
  assert.equal(buildTwoFactorCredentialState(result.user), buildTwoFactorCredentialState(f.verifiedUser));
  assert.deepEqual(f.expectations, []);
});
