import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  SESSION_JWT_DEFAULT_EXPIRY,
  SESSION_JWT_DEFAULT_EXPIRY_JITTER_SECONDS,
  SESSION_JWT_HS256_FALLBACK_WARNING,
  SESSION_JWT_ALGORITHM,
  SESSION_JWT_LEGACY_ALGORITHM,
  SESSION_JWT_MIN_DEFAULT_EXPIRY_SECONDS,
  SESSION_JWT_RS256_PRODUCTION_REQUIRED_ERROR,
  resolveSessionJwtExpiresAt,
  resolveSessionJwtId,
  resolveSessionJwtDefaultExpiresInSeconds,
  resetSessionJwtStartupValidationWarningForTests,
  shouldRefreshSessionJwt,
  signSessionJwt,
  signSessionJwtWithSecret,
  signSessionJwtWithKeySet,
  validateJwtAlgorithm,
  validateSessionJwtStartupConfiguration,
  verifyJwtWithAnySecret,
  verifySessionJwt,
  verifySessionJwtWithKeySet,
} from "../session-jwt";
import {
  parseAuthenticatedSessionJwtPayload,
  parseWebSocketSessionJwtPayload,
} from "../session-jwt-payload";

test("signSessionJwt applies the default session expiry when omitted", () => {
  const token = signSessionJwt({ username: "alice", role: "admin" });
  const decoded = verifySessionJwt<{ iat?: number; exp?: number; jti?: string }>(token);

  assert.ok(decoded.iat);
  assert.ok(decoded.exp);
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
    const decoded = verifySessionJwt<{ iat?: number; exp?: number }>(token);
    assert.ok(decoded.iat);
    assert.ok(decoded.exp);
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
  const twoFactorDecoded = verifySessionJwt<{ iat?: number; exp?: number }>(twoFactorToken);
  assert.ok(twoFactorDecoded.iat);
  assert.ok(twoFactorDecoded.exp);
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
  assert.equal(validateJwtAlgorithm(modernToken), SESSION_JWT_ALGORITHM);
  const modernPayload = verifySessionJwtWithKeySet<{
    username: string;
    role: string;
    iat: number;
    exp: number;
    jti: string;
  }>(modernToken, keySet);
  assert.deepEqual(
    modernPayload,
    {
      username: "alice",
      role: "admin",
      iat: modernPayload.iat,
      exp: modernPayload.exp,
      jti: modernPayload.jti,
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

test("session JWT startup validation rejects production HS256 fallback", () => {
  resetSessionJwtStartupValidationWarningForTests();

  assert.throws(
    () => validateSessionJwtStartupConfiguration({
      nodeEnv: "production",
      privateKey: "",
      publicKey: "",
      warn: () => assert.fail("production fallback must not warn and continue"),
    }),
    new RegExp(SESSION_JWT_RS256_PRODUCTION_REQUIRED_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("session JWT startup validation warns for development HS256 fallback", () => {
  resetSessionJwtStartupValidationWarningForTests();
  const warnings: string[] = [];

  const algorithm = validateSessionJwtStartupConfiguration({
    nodeEnv: "development",
    privateKey: "",
    publicKey: "",
    warn: (message) => warnings.push(message),
  });

  assert.equal(algorithm, SESSION_JWT_LEGACY_ALGORITHM);
  assert.deepEqual(warnings, [SESSION_JWT_HS256_FALLBACK_WARNING]);
});

test("session JWT startup validation accepts matching RS256 key material", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();

  const algorithm = validateSessionJwtStartupConfiguration({
    nodeEnv: "production",
    privateKey: privatePem,
    publicKey: publicPem,
    warn: () => assert.fail("RS256 startup validation should not warn"),
  });

  assert.equal(algorithm, SESSION_JWT_ALGORITHM);
});

test("session JWT startup validation rejects mismatched RS256 keys", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const { publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  assert.throws(
    () => validateSessionJwtStartupConfiguration({
      nodeEnv: "production",
      privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
      warn: () => assert.fail("mismatched RS256 keys must not warn and continue"),
    }),
    /valid matching RSA key pair/i,
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
    /unsupported session signing algorithm/i,
  );
});

function createUnsignedJwt(payload: Record<string, unknown>, algorithm: string): string {
  const encode = (value: Record<string, unknown>) => Buffer
    .from(JSON.stringify(value), "utf8")
    .toString("base64url");
  return `${encode({ alg: algorithm, typ: "JWT" })}.${encode(payload)}.`;
}

test("verifyJwtWithAnySecret rejects alg none tokens before signature verification", () => {
  const token = createUnsignedJwt({ username: "alice" }, "none");

  assert.throws(
    () => verifyJwtWithAnySecret(token, ["current-secret"]),
    /alg=none is not allowed/i,
  );
});

test("verifyJwtWithAnySecret rejects tampered tokens after algorithm validation", () => {
  const token = jwt.sign(
    { username: "alice" },
    "current-secret",
    { algorithm: SESSION_JWT_LEGACY_ALGORITHM },
  );
  const [header, , signature] = token.split(".");
  if (!header || !signature) {
    assert.fail("Expected a compact JWT with header and signature segments.");
  }
  const tamperedPayload = Buffer
    .from(JSON.stringify({ username: "mallory" }), "utf8")
    .toString("base64url");

  assert.throws(
    () => verifyJwtWithAnySecret(`${header}.${tamperedPayload}.${signature}`, ["current-secret"]),
    /invalid signature/i,
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
