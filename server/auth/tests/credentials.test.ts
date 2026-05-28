import assert from "node:assert/strict";
import test from "node:test";

import { normalizeUsernameInput } from "../credentials";

test("normalizeUsernameInput applies NFKC, trims, and lowercases usernames", () => {
  assert.equal(normalizeUsernameInput("  Ｔｅｓｔ.User  "), "test.user");
});
