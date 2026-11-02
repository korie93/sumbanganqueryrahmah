import assert from "node:assert/strict";
import test from "node:test";
import { getResetTokenRecoveryAction, getResetTokenValidationFailure } from "./reset-token-validation-feedback";

const apiError = (status: number, code?: string, retryAfterMs?: number) =>
  new Error(`${status}: ${JSON.stringify({ error: { code, retryAfterMs } })}`);

test("primary recovery actions follow explicit server token outcomes, never message guesses", () => {
  for (const code of ["TOKEN_USED", "RESET_TOKEN_USED"]) {
    assert.equal(getResetTokenRecoveryAction(apiError(410, code)), "sign-in");
  }
  for (const code of ["INVALID_TOKEN", "TOKEN_EXPIRED", "TOKEN_SUPERSEDED", "ACCOUNT_UNAVAILABLE",
    "RESET_TOKEN_INVALID", "RESET_TOKEN_EXPIRED", "RESET_TOKEN_SUPERSEDED"]) {
    assert.equal(getResetTokenRecoveryAction({ code }), "request-link");
  }
  assert.equal(getResetTokenRecoveryAction(apiError(500, "INTERNAL_SERVER_ERROR")), null);
  assert.equal(getResetTokenRecoveryAction(new Error("TOKEN_USED")), null);
  assert.equal(getResetTokenRecoveryAction(apiError(400, "PASSWORD_CONFIRMATION_MISMATCH")), null);
});

test("only authoritative token/access rejections are treated as unavailable links", () => {
  for (const code of ["INVALID_TOKEN", "TOKEN_EXPIRED", "TOKEN_USED", "TOKEN_SUPERSEDED",
    "RESET_TOKEN_INVALID", "RESET_TOKEN_EXPIRED", "RESET_TOKEN_USED", "RESET_TOKEN_SUPERSEDED", "ACCOUNT_UNAVAILABLE"]) {
    for (const error of [{ code }, { error: { code } }, apiError(410, code)]) {
      assert.deepEqual(getResetTokenValidationFailure(error), { retryable: false, rateLimited: false, retryAfterMs: 0 }, code);
    }
  }
  for (const status of [400, 401, 403, 404, 409, 410, 422]) {
    assert.equal(getResetTokenValidationFailure(apiError(status)).retryable, false, String(status));
  }
});

test("network, server, timeout and malformed-success failures remain manually retryable", () => {
  for (const error of [new TypeError("Failed to fetch"), new Error("You appear to be offline."),
    new Error("Request timed out"), new Error("API contract mismatch"), undefined,
    ...[408, 500, 502, 503, 504].map(status => apiError(status))]) {
    assert.deepEqual(getResetTokenValidationFailure(error), { retryable: true, rateLimited: false, retryAfterMs: 0 });
  }
});

test("rate-limited validation retains the server delay and has a conservative fallback", () => {
  assert.deepEqual(getResetTokenValidationFailure(apiError(429, "AUTH_RATE_LIMITED", 1500)),
    { retryable: true, rateLimited: true, retryAfterMs: 1500 });
  assert.equal(getResetTokenValidationFailure({ status: 429, retryAfterMs: 2500 }).retryAfterMs, 2500);
  assert.equal(getResetTokenValidationFailure(new Error('429: {"retryAfterMs":8000}')).retryAfterMs, 8000);
  assert.equal(getResetTokenValidationFailure({ code: "AUTH_RATE_LIMITED", retryAfterMs: 3500 }).retryAfterMs, 3500);
  for (const retryAfterMs of [undefined, 0, -1, NaN, Infinity, "invalid"]) {
    assert.equal(getResetTokenValidationFailure({ status: 429, retryAfterMs }).retryAfterMs, 60_000);
  }
  assert.equal(getResetTokenValidationFailure({ status: 429, retryAfterMs: 2 ** 40 }).retryAfterMs, 2_147_483_647);
  assert.equal(getResetTokenValidationFailure({ status: 429, code: "TOKEN_USED", retryAfterMs: 1500 }).retryAfterMs, 0);
});
