import assert from "node:assert/strict";
import test from "node:test";

import { isCredentialEmail } from "../../../shared/credential-email";
import { normalizeUsernameInput } from "../credentials";

test("normalizeUsernameInput applies NFKC, trims, and lowercases usernames", () => {
  assert.equal(normalizeUsernameInput("  Ｔｅｓｔ.User  "), "test.user");
});

test("credential email classification preserves the existing account lookup rules", () => {
  for (const value of [
    "staff+tag@example.test", "A@B.C", "staff@sub.example.test", "stáff@équipe.test",
    // Account lookup has historically accepted these when an internal domain dot exists.
    "staff@sub..test", "staff@sub.test.",
  ]) {
    assert.equal(isCredentialEmail(value), true, value);
  }
  for (const value of [
    "", "staff.user", "@example.test", "staff@", "staff@example", "staff@.test", "staff@example.",
    "staff@@example.test", "staff@exam ple.test", "staff\u00a0user@example.test", "staff@example.test\n",
  ]) {
    assert.equal(isCredentialEmail(value), false, JSON.stringify(value));
  }
});
