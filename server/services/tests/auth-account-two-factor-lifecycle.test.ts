import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "../../auth/passwords";
import {
  decryptTwoFactorSecretPayload,
  buildTwoFactorCredentialState,
  encryptTwoFactorSecret,
  generateCurrentTwoFactorCode,
} from "../../auth/two-factor";
import { resetTwoFactorReplayCacheForTests } from "../../auth/two-factor-replay-cache";
import { AuthAccountSelfTwoFactorOperations } from "../auth-account-self-two-factor-operations";
import { requiresTwoFactor } from "../auth-account-login-guard-utils";
import { AuthAccountError } from "../auth-account-types";
import { AuthAccountAuthenticationOperations } from "../auth-account-authentication-operations";

type Actor = Parameters<AuthAccountSelfTwoFactorOperations["startTwoFactorSetup"]>[0];
type Storage = ConstructorParameters<typeof AuthAccountSelfTwoFactorOperations>[0]["storage"];
const TEST_SECRET = "JBSWY3DPEHPK3PXP";
const TEST_PASSWORD = "Example-test-password-123!";
let passwordHash: string;
const previousKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
test.before(async () => {
  process.env.TWO_FACTOR_ENCRYPTION_KEY = "isolated-two-factor-lifecycle-test-key";
  passwordHash = await hashPassword(TEST_PASSWORD);
});
test.after(() => {
  if (previousKey === undefined) delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
  else process.env.TWO_FACTOR_ENCRYPTION_KEY = previousKey;
});
test.beforeEach(() => resetTwoFactorReplayCacheForTests());

function fixture(enabled = false) {
  let user = {
    id: "two-factor-lifecycle-user", username: "lifecycle.admin", role: "admin", status: "active",
    passwordHash, twoFactorEnabled: enabled,
    twoFactorSecretEncrypted: enabled ? encryptTwoFactorSecret(TEST_SECRET, "sha256") : null,
    twoFactorConfiguredAt: enabled ? new Date() : null,
  } as Actor;
  let writes = 0;
  let sessions = 0;
  const audits: unknown[] = [];
  const storage = {
    getUser: async () => ({ ...user }),
    getUserByUsername: async () => ({ ...user }),
    isVisitorBanned: async () => false,
    getActiveActivitiesByUsername: async () => [],
    deactivateUserActivities: async () => undefined,
    touchLastLogin: async () => undefined,
    createActivity: async () => ({ id: `activity-${++sessions}`, username: user.username }),
    updateUserAccount: async (params: Record<string, unknown>) => {
      const expected = params.expectedTwoFactorState as {
        enabled: boolean; encryptedSecret: string | null; passwordHash: string;
      } | undefined;
      if (expected && (
        (user.twoFactorEnabled === true) !== expected.enabled
        || user.twoFactorSecretEncrypted !== expected.encryptedSecret
        || user.passwordHash !== expected.passwordHash
      )) return undefined;
      const { userId: _id, expectedTwoFactorState: _expected, ...updates } = params;
      user = { ...user, ...updates };
      writes += 1;
      return { ...user };
    },
    createAuditLog: async (entry: unknown) => { audits.push(entry); return {}; },
  } as unknown as Storage;
  return {
    operations: new AuthAccountSelfTwoFactorOperations({ storage }),
    authentication: new AuthAccountAuthenticationOperations({
      storage: storage as unknown as ConstructorParameters<typeof AuthAccountAuthenticationOperations>[0]["storage"],
    }),
    update: (updates: Partial<Actor>) => { user = { ...user, ...updates }; },
    get user() { return { ...user }; },
    get writes() { return writes; },
    get sessions() { return sessions; },
    audits,
  };
}

function codeError(expected: string) {
  return (error: unknown) => {
    assert.ok(error instanceof AuthAccountError);
    assert.equal(error.code, expected);
    return true;
  };
}

test("starting setup must not disable an already enabled factor with password-only proof", async () => {
  const f = fixture(true);
  const before = f.user;
  await assert.rejects(f.operations.startTwoFactorSetup(before, { currentPassword: TEST_PASSWORD }),
    codeError("TWO_FACTOR_ALREADY_ENABLED"));
  assert.equal(f.writes, 0);
  assert.deepEqual(f.user, before);
});

test("primary credentials cannot establish a session until correct second factor succeeds once", async (t) => {
  let now = Date.parse("2026-09-12T00:00:00Z");
  t.mock.method(Date, "now", () => now);
  const f = fixture(true);
  const result = await f.authentication.login({
    username: f.user.username, password: TEST_PASSWORD, browserName: "Test browser",
  });
  assert.equal(result.kind, "two_factor_required");
  assert.equal(f.sessions, 0);
  const challenge = {
    id: "78b8fdb4-aa76-4b72-a916-6e89346451fa",
    credentialState: buildTwoFactorCredentialState(f.user), expiresAtMs: now + 300_000,
  };
  const input = { userId: f.user.id, browserName: "Test browser", challenge, code: "invalid" };
  await assert.rejects(f.authentication.verifyTwoFactorLogin(input), codeError("TWO_FACTOR_INVALID_CODE"));
  assert.equal(f.sessions, 0);
  await f.authentication.verifyTwoFactorLogin({ ...input, code: generateCurrentTwoFactorCode(TEST_SECRET, "sha256") });
  assert.equal(f.sessions, 1);
  now += 30_000;
  await assert.rejects(f.authentication.verifyTwoFactorLogin({
    ...input, code: generateCurrentTwoFactorCode(TEST_SECRET, "sha256"),
  }), codeError("TWO_FACTOR_CHALLENGE_EXPIRED"));
  assert.equal(f.sessions, 1);
});

test("expired and credential-invalidated challenges never create sessions", async (t) => {
  const now = Date.parse("2026-09-12T00:00:00Z");
  t.mock.method(Date, "now", () => now);
  const f = fixture(true);
  const challenge = {
    id: "78b8fdb4-aa76-4b72-a916-6e89346451fa",
    credentialState: buildTwoFactorCredentialState(f.user), expiresAtMs: now,
  };
  const input = { userId: f.user.id, browserName: "Test", challenge, code: generateCurrentTwoFactorCode(TEST_SECRET, "sha256") };
  await assert.rejects(f.authentication.verifyTwoFactorLogin(input), codeError("TWO_FACTOR_CHALLENGE_EXPIRED"));
  challenge.expiresAtMs = now + 300_000;
  f.update({ passwordHash: "changed-hash" });
  await assert.rejects(f.authentication.verifyTwoFactorLogin(input), codeError("TWO_FACTOR_CHALLENGE_EXPIRED"));
  assert.equal(f.sessions, 0);
});

test("normal accounts without 2FA still authenticate and corrupted enabled factors fail closed", async () => {
  const normal = fixture();
  const result = await normal.authentication.login({
    username: normal.user.username, password: TEST_PASSWORD, browserName: "Test",
  });
  assert.equal(result.kind, "authenticated");
  assert.equal(normal.sessions, 1);
  const corrupt = fixture(true);
  corrupt.update({ twoFactorSecretEncrypted: null });
  const login = await corrupt.authentication.login({
    username: corrupt.user.username, password: TEST_PASSWORD, browserName: "Test",
  });
  assert.equal(login.kind, "two_factor_required");
  await assert.rejects(corrupt.authentication.verifyTwoFactorLogin({
    userId: corrupt.user.id, browserName: "Test", code: "123456",
  }), codeError("TWO_FACTOR_SECRET_INVALID"));
  assert.equal(corrupt.sessions, 0);
});

test("enabled flags never silently bypass 2FA when stored secret is missing or role changes", () => {
  const f = fixture(true);
  assert.equal(requiresTwoFactor({ ...f.user, twoFactorSecretEncrypted: null }), true);
  assert.equal(requiresTwoFactor({ ...f.user, role: "manager" }), true);
});

test("setup imports its actual algorithm and only enables after a matching code", async (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-09-12T00:00:00Z"));
  const f = fixture();
  const result = await f.operations.startTwoFactorSetup(f.user, { currentPassword: TEST_PASSWORD });
  assert.equal(f.user.twoFactorEnabled, false);
  const secret = decryptTwoFactorSecretPayload(f.user.twoFactorSecretEncrypted!);
  const wrongAlgorithm = secret.algorithm === "sha256" ? "sha1" : "sha256";
  await assert.rejects(f.operations.confirmTwoFactorSetup(f.user, {
    code: generateCurrentTwoFactorCode(secret.secret, wrongAlgorithm),
  }), codeError("TWO_FACTOR_INVALID_CODE"));
  assert.equal(f.user.twoFactorEnabled, false);
  await f.operations.confirmTwoFactorSetup(f.user, {
    code: generateCurrentTwoFactorCode(secret.secret, secret.algorithm),
  });
  assert.equal(f.user.twoFactorEnabled, true);
  assert.equal(decryptTwoFactorSecretPayload(f.user.twoFactorSecretEncrypted!).secret, result.setup.secret);
});

test("superseded setup cannot enable a different unverified secret", async () => {
  const f = fixture();
  await f.operations.startTwoFactorSetup(f.user, { currentPassword: TEST_PASSWORD });
  const oldActor = f.user;
  const oldSecret = decryptTwoFactorSecretPayload(oldActor.twoFactorSecretEncrypted!);
  await f.operations.startTwoFactorSetup(f.user, { currentPassword: TEST_PASSWORD });
  const currentSecret = f.user.twoFactorSecretEncrypted;
  await assert.rejects(f.operations.confirmTwoFactorSetup(oldActor, {
    code: generateCurrentTwoFactorCode(oldSecret.secret, oldSecret.algorithm),
  }), codeError("TWO_FACTOR_SETUP_EXPIRED"));
  assert.equal(f.user.twoFactorEnabled, false);
  assert.equal(f.user.twoFactorSecretEncrypted, currentSecret);
});

test("expired setup has a safe restart path and cannot enable", async (t) => {
  let now = Date.parse("2026-09-12T00:00:00Z");
  t.mock.method(Date, "now", () => now);
  const f = fixture();
  await f.operations.startTwoFactorSetup(f.user, { currentPassword: TEST_PASSWORD });
  const secret = decryptTwoFactorSecretPayload(f.user.twoFactorSecretEncrypted!);
  now += 10 * 60 * 1_000;
  await assert.rejects(f.operations.confirmTwoFactorSetup(f.user, {
    code: generateCurrentTwoFactorCode(secret.secret, secret.algorithm),
  }), codeError("TWO_FACTOR_SETUP_EXPIRED"));
  assert.equal(f.user.twoFactorEnabled, false);
});

test("legacy confirmed factors can disable with password and valid code then re-enroll", async () => {
  const f = fixture(true);
  await assert.rejects(f.operations.disableTwoFactor(f.user, {
    currentPassword: "incorrect", code: generateCurrentTwoFactorCode(TEST_SECRET, "sha256"),
  }), codeError("INVALID_CURRENT_PASSWORD"));
  assert.equal(f.user.twoFactorEnabled, true);
  await f.operations.disableTwoFactor(f.user, {
    currentPassword: TEST_PASSWORD, code: generateCurrentTwoFactorCode(TEST_SECRET, "sha256"),
  });
  assert.equal(f.user.twoFactorEnabled, false);
  assert.equal(f.user.twoFactorSecretEncrypted, null);
  await f.operations.startTwoFactorSetup(f.user, { currentPassword: TEST_PASSWORD });
  const secret = decryptTwoFactorSecretPayload(f.user.twoFactorSecretEncrypted!);
  await f.operations.confirmTwoFactorSetup(f.user, { code: generateCurrentTwoFactorCode(secret.secret, secret.algorithm) });
  assert.equal(f.user.twoFactorEnabled, true);
  const auditText = JSON.stringify(f.audits);
  assert.ok(!auditText.includes(secret.secret));
  assert.ok(!auditText.includes(TEST_PASSWORD));
});
