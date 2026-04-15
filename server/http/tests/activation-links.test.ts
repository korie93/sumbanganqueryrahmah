import assert from "node:assert/strict";
import test from "node:test";
import { buildActivationUrl, buildPasswordResetUrl } from "../../auth/activation-links";

test("activation links place the token in the URL hash instead of the query string", () => {
  const url = new URL(buildActivationUrl("token-123"));
  assert.equal(url.pathname, "/activate-account");
  assert.equal(url.search, "");
  assert.equal(url.hash, "#token=token-123");
});

test("password reset links place the token in the URL hash instead of the query string", () => {
  const url = new URL(buildPasswordResetUrl("reset-456"));
  assert.equal(url.pathname, "/reset-password");
  assert.equal(url.search, "");
  assert.equal(url.hash, "#token=reset-456");
});
