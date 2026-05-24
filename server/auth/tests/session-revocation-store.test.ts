import assert from "node:assert/strict";
import test from "node:test";
import {
  isSessionJwtRevoked,
  resetSessionRevocationStoreForTests,
  revokeSessionJwt,
} from "../session-revocation-store";

test.beforeEach(() => {
  resetSessionRevocationStoreForTests();
});

test.after(() => {
  resetSessionRevocationStoreForTests();
});

test("memory session revocation store rejects revoked JWT ids until they expire", async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);

  await revokeSessionJwt({
    jwtId: "jwt-1",
    expiresAtMs: now + 1_000,
  });

  assert.equal(await isSessionJwtRevoked("jwt-1"), true);
  assert.equal(await isSessionJwtRevoked("jwt-2"), false);

  now += 1_001;

  assert.equal(await isSessionJwtRevoked("jwt-1"), false);
});

test("memory session revocation store ignores blank JWT ids", async () => {
  await revokeSessionJwt({
    jwtId: "   ",
    expiresAtMs: Date.now() + 1_000,
  });

  assert.equal(await isSessionJwtRevoked("   "), false);
  assert.equal(await isSessionJwtRevoked(null), false);
});
