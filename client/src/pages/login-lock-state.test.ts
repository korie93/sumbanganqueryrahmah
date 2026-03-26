import assert from "node:assert/strict";
import test from "node:test";
import { isLockedAccountFlow, normalizeLoginIdentity } from "@/pages/login-lock-state";

test("normalizeLoginIdentity trims and lowercases login identifiers", () => {
  assert.equal(normalizeLoginIdentity("  User.Name  "), "user.name");
  assert.equal(normalizeLoginIdentity(""), "");
  assert.equal(normalizeLoginIdentity(undefined), "");
});

test("isLockedAccountFlow only stays active for the locked username while password login is shown", () => {
  assert.equal(
    isLockedAccountFlow({
      lockedUsername: "Locked.User",
      currentUsername: " locked.user ",
      twoFactorChallengeToken: "",
    }),
    true,
  );
  assert.equal(
    isLockedAccountFlow({
      lockedUsername: "locked.user",
      currentUsername: "other.user",
      twoFactorChallengeToken: "",
    }),
    false,
  );
});

test("isLockedAccountFlow yields to the two-factor challenge state", () => {
  assert.equal(
    isLockedAccountFlow({
      lockedUsername: "locked.user",
      currentUsername: "locked.user",
      twoFactorChallengeToken: "challenge-token",
    }),
    false,
  );
});
