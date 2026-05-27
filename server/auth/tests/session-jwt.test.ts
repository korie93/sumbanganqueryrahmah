import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  SESSION_JWT_DEFAULT_EXPIRY,
  SESSION_JWT_ALGORITHM,
  resolveSessionJwtExpiresAt,
  resolveSessionJwtId,
  shouldRefreshSessionJwt,
  signSessionJwt,
  signSessionJwtWithSecret,
  verifyJwtWithAnySecret,
} from "../session-jwt";
import {
  parseAuthenticatedSessionJwtPayload,
  parseWebSocketSessionJwtPayload,
} from "../session-jwt-payload";

test("signSessionJwt applies the default session expiry when omitted", () => {
  const token = signSessionJwt({ username: "alice", role: "admin" });
  const decoded = jwt.decode(token) as { iat?: number; exp?: number; jti?: string } | null;

  assert.ok(decoded?.iat);
  assert.ok(decoded?.exp);
  assert.match(decoded?.jti ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(decoded.exp - decoded.iat, SESSION_JWT_DEFAULT_EXPIRY);
  assert.equal(resolveSessionJwtExpiresAt(token)?.getTime(), decoded.exp * 1000);
  assert.equal(resolveSessionJwtId(token), decoded.jti);
});

test("signSessionJwtWithSecret signs with an explicit secret for scoped guard instances", () => {
  const token = signSessionJwtWithSecret({ username: "alice", role: "admin" }, "scoped-secret");
  const payload = verifyJwtWithAnySecret<{ username: string; role: string }>(token, "scoped-secret");

  assert.equal(payload.username, "alice");
  assert.equal(payload.role, "admin");
});

test("shouldRefreshSessionJwt refreshes only inside the final 20 percent of token lifetime", () => {
  const nowMs = 1_800_000_000_000;
  const issuedAt = Math.floor(nowMs / 1000) - 20;

  assert.equal(
    shouldRefreshSessionJwt({
      iat: issuedAt,
      exp: Math.floor(nowMs / 1000) + 80,
      jti: "jwt-fresh",
    }, nowMs),
    false,
  );

  assert.equal(
    shouldRefreshSessionJwt({
      iat: Math.floor(nowMs / 1000) - 81,
      exp: Math.floor(nowMs / 1000) + 19,
      jti: "jwt-near-expiry",
    }, nowMs),
    true,
  );

  assert.equal(
    shouldRefreshSessionJwt({
      iat: Math.floor(nowMs / 1000) - 81,
      exp: Math.floor(nowMs / 1000) + 19,
    }, nowMs),
    false,
  );
});

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

test("verifyJwtWithAnySecret rejects tokens signed with non-session algorithms", () => {
  const token = jwt.sign(
    { username: "alice" },
    "current-secret",
    { algorithm: "HS384" },
  );

  assert.throws(
    () => verifyJwtWithAnySecret(token, ["current-secret"]),
    /invalid algorithm/i,
  );
});

test("parseAuthenticatedSessionJwtPayload accepts only complete authenticated session claims", () => {
  assert.deepEqual(
    parseAuthenticatedSessionJwtPayload({
      userId: "user-1",
      username: "alice",
      role: "admin",
      activityId: "activity-1",
      exp: 1_800_000_000,
      iat: 1_799_999_000,
      jti: "jwt-1",
    }),
    {
      userId: "user-1",
      username: "alice",
      role: "admin",
      activityId: "activity-1",
      exp: 1_800_000_000,
      iat: 1_799_999_000,
      jti: "jwt-1",
    },
  );

  assert.throws(
    () => parseAuthenticatedSessionJwtPayload({
      username: "alice",
      role: "admin",
      activityId: "activity-1",
    }),
    /Invalid session JWT payload/,
  );
  assert.throws(
    () => parseAuthenticatedSessionJwtPayload({
      userId: "user-1",
      username: "alice",
      role: "admin",
      activityId: "",
    }),
    /Invalid session JWT payload/,
  );
  assert.throws(
    () => parseAuthenticatedSessionJwtPayload({
      userId: "user-1",
      username: "alice",
      role: "admin",
      activityId: "activity-1",
      injected: "do-not-accept",
    }),
    /Invalid session JWT payload/,
  );
});

test("parseWebSocketSessionJwtPayload validates activity id while tolerating session identity claims", () => {
  assert.deepEqual(
    parseWebSocketSessionJwtPayload({
      userId: "user-1",
      username: "alice",
      role: "admin",
      activityId: "activity-1",
    }),
    {
      userId: "user-1",
      username: "alice",
      role: "admin",
      activityId: "activity-1",
    },
  );

  assert.deepEqual(
    parseWebSocketSessionJwtPayload({
      activityId: "activity-1",
    }),
    {
      activityId: "activity-1",
    },
  );

  assert.throws(
    () => parseWebSocketSessionJwtPayload({
      activityId: " ",
    }),
    /Invalid session JWT payload/,
  );
});
