import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  SESSION_JWT_ALGORITHM,
  verifyJwtWithAnySecret,
} from "../session-jwt";

test("verifyJwtWithAnySecret accepts a token signed with a previous manual rotation secret", () => {
  const token = jwt.sign(
    { username: "alice", role: "admin" },
    "old-secret",
    { algorithm: SESSION_JWT_ALGORITHM },
  );

  const payload = verifyJwtWithAnySecret<{ username: string; role: string }>(token, [
    "current-secret",
    "old-secret",
  ]);

  assert.equal(payload.username, "alice");
  assert.equal(payload.role, "admin");
});

test("verifyJwtWithAnySecret rejects when none of the configured secrets can verify the token", () => {
  const token = jwt.sign(
    { username: "alice" },
    "different-secret",
    { algorithm: SESSION_JWT_ALGORITHM },
  );

  assert.throws(
    () => verifyJwtWithAnySecret(token, ["current-secret", "old-secret"]),
    /invalid signature/i,
  );
});
