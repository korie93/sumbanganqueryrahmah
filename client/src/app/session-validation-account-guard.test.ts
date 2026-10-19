import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveSessionValidationAccount } from "./session-validation-account-guard";

test("session validation accepts only the same backend account ID in the current runtime", () => {
  assert.equal(resolveSessionValidationAccount({ id: "account-a" }, { id: "account-a" }), "same-account");
  assert.equal(resolveSessionValidationAccount({ id: "account-a" }, { id: "account-b" }), "rebind-account");
  assert.equal(resolveSessionValidationAccount({}, { id: "account-a" }), "rebind-account");
});

test("an absent backend account ID fails closed instead of matching two missing IDs", () => {
  for (const id of [undefined, "", "   "]) {
    assert.equal(resolveSessionValidationAccount({ id: "account-a" }, { id }), "unverified-account");
    assert.equal(resolveSessionValidationAccount({}, { id }), "unverified-account");
  }
});

test("internal account IDs are compared exactly without username or case fallbacks", () => {
  assert.equal(resolveSessionValidationAccount({ id: "account-a" }, { id: "ACCOUNT-A" }), "rebind-account");
  assert.equal(resolveSessionValidationAccount({ id: "account-a" }, { id: " account-a " }), "rebind-account");
});

test("the protected session hook rebinds before persisting or accepting another account", () => {
  const source = readFileSync(new URL("./useAppShellSessionValidation.ts", import.meta.url), "utf8");
  const guardStart = source.indexOf("const accountResolution = resolveSessionValidationAccount(actor, nextUser);");
  const persistStart = source.indexOf("persistAuthenticatedUser(nextUser);");
  assert.ok(guardStart >= 0 && persistStart > guardStart);
  const accountBoundary = source.slice(guardStart, persistStart);
  assert.match(accountBoundary, /accountResolution === "rebind-account" && onAccountChanged/);
  assert.match(accountBoundary, /onAccountChanged\(nextUser\)/);
  assert.match(accountBoundary, /catch \{\s*setUser\(null\);/);
  assert.match(accountBoundary, /else \{\s*setUser\(null\);/);
  assert.match(accountBoundary, /return;\s*\}/);
  assert.doesNotMatch(accountBoundary, /setUser\(nextUser\)|applyLoggedOutClientState|clearAuthenticatedUserStorage|broadcastForcedLogout/);
});

test("authenticated runtime forwards identity changes to the owning auth boundary", () => {
  const source = readFileSync(new URL("./useAuthenticatedAppState.ts", import.meta.url), "utf8");
  assert.match(source, /onAccountChanged\?: \(\(user: User\) => void\) \| undefined/);
  assert.match(source, /useAppShellSessionValidation\(\{[\s\S]*?user,\s*onAccountChanged,/);
});
