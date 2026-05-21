import assert from "node:assert/strict";
import test from "node:test";
import { resolveTwoFactorTotpAlgorithm } from "../runtime-config-resolvers";

test("resolveTwoFactorTotpAlgorithm loads supported runtime config values", () => {
  assert.equal(resolveTwoFactorTotpAlgorithm(null), "sha1");
  assert.equal(resolveTwoFactorTotpAlgorithm(""), "sha1");
  assert.equal(resolveTwoFactorTotpAlgorithm("SHA1"), "sha1");
  assert.equal(resolveTwoFactorTotpAlgorithm("sha256"), "sha256");
  assert.equal(resolveTwoFactorTotpAlgorithm(" SHA256 "), "sha256");
});
