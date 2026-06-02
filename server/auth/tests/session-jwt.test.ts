import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  SESSION_JWT_DEFAULT_EXPIRY,
  SESSION_JWT_DEFAULT_EXPIRY_JITTER_SECONDS,
  SESSION_JWT_ALGORITHM,
  SESSION_JWT_LEGACY_ALGORITHM,
  SESSION_JWT_MIN_DEFAULT_EXPIRY_SECONDS,
  resolveSessionJwtExpiresAt,
  resolveSessionJwtId,
  resolveSessionJwtDefaultExpiresInSeconds,
  shouldRefreshSessionJwt,
  signSessionJwt,
  signSessionJwtWithSecret,
  signSessionJwtWithKeySet,
  verifyJwtWithAnySecret,
  verifySessionJwtWithKeySet,
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
  assert.ok(decoded.exp - decoded.iat <= SESSION_JWT_DEFAULT_EXPIRY);
  assert.ok(decoded.exp - decoded.iat >= SESSION_JWT_MIN_DEFAULT_EXPIRY_SECONDS);
  assert.equal(resolveSessionJwtExpiresAt(token)?.getTime(), decoded.exp * 1000);
  assert.equal(resolveSessionJwtId(token), decoded.jti);
});

test("default session expiry jitter keeps the maximum TTL unchanged and enforces a floor", () => {
  assert.equal(resolveSessionJwtDefaultExpiresInSeconds(() => 0), SESSION_JWT_DEFAULT_EXPIRY);
  assert.equal(
    resolveSessionJwtDefaultExpiresInSeconds(() => 0.5),
    SESSION_JWT_DEFAULT_EXPIRY - Math.floor(SESSION_JWT_DEFAULT_EXPIRY_JITTER_SECONDS / 2),
  );
  assert.equal(
    resolveSessionJwtDefaultExpiresInSeconds(() => 1),
    SESSION_JWT_MIN_DEFAULT_EXPIRY_SECONDS,
  );
  assert.equal(resolveSessionJwtDefaultExpiresInSeconds(() => Number.NaN), SESSION_JWT_DEFAULT_EXPIRY);
});

test("signSessionJwt applies bounded non-identical jitter only to default expiry", (t) => {
  const originalRandom = Math.random;
  const randomValues = [0, 0.5, 1, 1];
  Math.random = () => randomValues.shift() ?? 0;
  t.after(() => {
    Math.random = originalRandom;
  });

  const defaultTtls = [0, 1, 2].map(() => {
    const token = signSessionJwt({ username: "alice", role: "admin" });
    const decoded = jwt.decode(token) as { iat?: number; exp?: number } | null;
    assert.ok(decoded?.iat);
    assert.ok(decoded?.exp);
    return decoded.exp - decoded.iat;
  });

  assert.deepEqual(defaultTtls, [
    SESSION_JWT_DEFAULT_EXPIRY,
    SESSION_JWT_DEFAULT_EXPIRY - Math.floor(SESSION_JWT_DEFAULT_EXPIRY_JITTER_SECONDS / 2),
    SESSION_JWT_MIN_DEFAULT_EXPIRY_SECONDS,
  ]);
  assert.equal(new Set(defaultTtls).size, 3);

  const twoFactorToken = signSessionJwt(
    { username: "alice", role: "admin", purpose: "two_factor_login" },
    { expiresIn: "5m" },
  );
  const twoFactorDecoded = jwt.decode(twoFactorToken) as { iat?: number; exp?: number } | null;
  assert.ok(twoFactorDecoded?.iat);
  assert.ok(twoFactorDecoded?.exp);
  assert.equal(twoFactorDecoded.exp - twoFactorDecoded.iat, 5 * 60);
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
    { algorithm: SESSION_JWT_LEGACY_ALGORITHM },
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
    { algorithm: SESSION_JWT_LEGACY_ALGORITHM },
  );

  assert.throws(
    () => verifyJwtWithAnySecret(token, ["current-secret", "old-secret"]),
    /invalid signature/i,
  );
});

test("session JWT keyset signs new tokens with RS256 while accepting legacy HS256 tokens", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const keySet = {
    hsSecrets: ["legacy-secret"],
    rsPrivateKey: privatePem,
    rsPublicKeys: [publicPem],
  };

  const modernToken = signSessionJwtWithKeySet({ username: "alice", role: "admin" }, keySet);
  const modernDecoded = jwt.decode(modernToken, { complete: true }) as {
    header?: { alg?: string };
  } | null;

  assert.equal(modernDecoded?.header?.alg, SESSION_JWT_ALGORITHM);
  assert.deepEqual(
    verifySessionJwtWithKeySet<{ username: string; role: string }>(modernToken, keySet),
    {
      username: "alice",
      role: "admin",
      iat: (jwt.decode(modernToken) as { iat: number }).iat,
      exp: (jwt.decode(modernToken) as { exp: number }).exp,
      jti: (jwt.decode(modernToken) as { jti: string }).jti,
    },
  );

  const legacyToken = jwt.sign(
    { username: "legacy", role: "user" },
    "legacy-secret",
    { algorithm: SESSION_JWT_LEGACY_ALGORITHM },
  );
  const legacyPayload = verifySessionJwtWithKeySet<{ username: string; role: string }>(
    legacyToken,
    keySet,
  );

  assert.equal(legacyPayload.username, "legacy");
  assert.equal(legacyPayload.role, "user");
});

test("verifyJwtWithAnySecret rejects tokens signed with non-session algorithms", () => {
  const token = jwt.sign(
    { username: "alice" },
    "current-secret",
    { algorithm: "HS384" },
  );

  assert.throws(
    () => verifyJwtWithAnySecret(token, ["current-secret"]),
    /unsupported session signing algorithm/i,
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
