import assert from "node:assert/strict";
import test from "node:test";
import { encryptTwoFactorSecret, generateCurrentTwoFactorCode } from "../../auth/two-factor";
import { resetTwoFactorReplayCacheForTests } from "../../auth/two-factor-replay-cache";
import { verifyTwoFactorSecretCode } from "../auth-account-login-guard-utils";
import { AuthAccountError } from "../auth-account-types";

test("a consumed valid login code has actionable replay feedback and remains rejected", async (t) => {
  const previousKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  process.env.TWO_FACTOR_ENCRYPTION_KEY = "isolated-two-factor-retry-test-key";
  resetTwoFactorReplayCacheForTests();
  t.after(() => {
    if (previousKey === undefined) delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    else process.env.TWO_FACTOR_ENCRYPTION_KEY = previousKey;
    resetTwoFactorReplayCacheForTests();
  });
  let now = Date.parse("2026-09-14T00:00:00Z");
  t.mock.method(Date, "now", () => now);
  const secret = "JBSWY3DPEHPK3PXP";
  const input = {
    code: generateCurrentTwoFactorCode(secret, "sha256"),
    encryptedSecret: encryptTwoFactorSecret(secret, "sha256"),
    replay: { purpose: "login" as const, subjectId: "isolated-retry-user" },
  };
  assert.deepEqual(await verifyTwoFactorSecretCode(input), { ok: true });
  await assert.rejects(verifyTwoFactorSecretCode(input), (error: unknown) => {
    assert.ok(error instanceof AuthAccountError);
    assert.equal(error.code, "TWO_FACTOR_CODE_REPLAYED");
    assert.equal(error.statusCode, 401);
    assert.doesNotMatch(error.message, new RegExp(`${secret}|${input.code}`));
    return true;
  });
  now += 30_000;
  assert.deepEqual(await verifyTwoFactorSecretCode({
    ...input,
    code: generateCurrentTwoFactorCode(secret, "sha256"),
  }), { ok: true });
});
