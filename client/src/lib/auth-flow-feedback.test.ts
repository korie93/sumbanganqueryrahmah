import assert from "node:assert/strict";
import test from "node:test";
import { getAuthErrorCode, getAuthErrorMessage, getAuthenticatorSetupParameters } from "./auth-flow-feedback";

test("auth feedback extracts both typed login and nested API errors without exposing payload JSON", () => {
  assert.equal(getAuthErrorCode({ code: "TWO_FACTOR_CODE_INVALID" }), "TWO_FACTOR_CODE_INVALID");
  const error = new Error('401: {"error":{"code":"TWO_FACTOR_CHALLENGE_EXPIRED","message":"expired"}}');
  assert.equal(getAuthErrorCode(error), "TWO_FACTOR_CHALLENGE_EXPIRED");
  assert.match(getAuthErrorMessage(error, "fallback"), /log masuk semula/);
  assert.equal(getAuthErrorCode(null), null);
  assert.equal(getAuthErrorCode(new Error("network unavailable")), null);
  assert.equal(getAuthErrorMessage(null, "fallback"), "fallback");
});

test("reset and activation distinguish expiry, consumed and superseded tokens using existing error contract", () => {
  for (const flow of ["reset", "activation"] as const) {
    assert.match(getAuthErrorMessage({ code: "TOKEN_EXPIRED" }, "fallback", flow), /tamat tempoh/);
    assert.match(getAuthErrorMessage({ code: "INVALID_TOKEN" }, "fallback", flow), /tidak sah/);
    assert.match(getAuthErrorMessage({ code: "TOKEN_SUPERSEDED" }, "fallback", flow), /emel terkini/);
    assert.doesNotMatch(getAuthErrorMessage({ code: "TOKEN_USED" }, "fallback", flow), /fallback/);
  }
  assert.match(getAuthErrorMessage({ code: "ACCOUNT_ALREADY_ACTIVATED" }, "fallback"), /sudah diaktifkan/);
  assert.match(getAuthErrorMessage({ code: "ACTIVATION_TOKEN_SUPERSEDED" }, "fallback"), /emel terkini/);
});

test("2FA errors distinguish invalid, replay, expiry, setup and rate protection", () => {
  for (const [code, expected] of [
    ["TWO_FACTOR_CODE_INVALID", /tidak betul/], ["TWO_FACTOR_CODE_REPLAYED", /telah digunakan/],
    ["TWO_FACTOR_CODE_EXPIRED", /tamat tempoh/], ["TWO_FACTOR_SETUP_EXPIRED", /Mulakan persediaan/],
    ["TWO_FACTOR_RATE_LIMITED", /Terlalu banyak percubaan/],
  ] as const) assert.match(getAuthErrorMessage({ code }, "fallback"), expected);
});

test("authenticator manual configuration follows exact URI algorithm and rejects missing/unsupported defaults", () => {
  const base = "otpauth://totp/SQR:test?secret=TESTONLY&issuer=SQR&digits=6&period=30";
  assert.deepEqual(getAuthenticatorSetupParameters(`${base}&algorithm=SHA256`), { algorithm: "SHA256", digits: 6, period: 30 });
  assert.deepEqual(getAuthenticatorSetupParameters(`${base}&algorithm=SHA1`), { algorithm: "SHA1", digits: 6, period: 30 });
  assert.equal(getAuthenticatorSetupParameters(base), null);
  assert.equal(getAuthenticatorSetupParameters(`${base}&algorithm=SHA512`), null);
  assert.equal(getAuthenticatorSetupParameters(`${base.replace("digits=6", "digits=8")}&algorithm=SHA256`), null);
  assert.equal(getAuthenticatorSetupParameters("javascript:alert(1)"), null);
});
