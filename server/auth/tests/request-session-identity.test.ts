import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import {
  createRateLimitIdentityMiddleware,
  getRateLimitIdentity,
  readRequestSessionToken,
  verifyRequestSessionIdentity,
} from "../request-session-identity";

const secret = "nat-request-session-test-signing-secret";
const claims = { userId: "user-1", username: "staff.one", role: "user", activityId: "activity-1", jti: "jwt-1" };

function createRequest(headers: Record<string, string> = {}): Request {
  return { headers, path: "/api/analytics/summary", method: "GET" } as Request;
}

function prime(req: Request): void {
  let nextCalls = 0;
  createRateLimitIdentityMiddleware({ secret })(req, {} as never, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
}

test("signed cookie and Bearer sessions expose a stable quota ID without authorizing req.user", () => {
  const token = jwt.sign(claims, secret, { expiresIn: "1h" });
  const sessionHeaders: Array<Record<string, string>> = [
    { authorization: `Bearer ${token}` },
    { cookie: `sqr_auth=${encodeURIComponent(token)}` },
  ];
  for (const headers of sessionHeaders) {
    const req = createRequest(headers);
    assert.equal(getRateLimitIdentity(req), null);
    prime(req);
    assert.equal(getRateLimitIdentity(req), "user-1");
    assert.equal((req as { user?: unknown }).user, undefined);
  }
});

test("request-local verification is reused once, isolated between requests, and secret/token bound", (t) => {
  const token = jwt.sign(claims, secret, { expiresIn: "1h" });
  const verifier = t.mock.method(jwt, "verify");
  const req = createRequest({ authorization: `Bearer ${token}` });
  prime(req);
  const first = verifyRequestSessionIdentity(req, token, secret);
  assert.strictEqual(verifyRequestSessionIdentity(req, token, secret), first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(verifier.mock.callCount(), 1);

  prime(createRequest({ authorization: `Bearer ${token}` }));
  assert.equal(verifier.mock.callCount(), 2);
  assert.throws(() => verifyRequestSessionIdentity(req, token, "different-secret"));
  assert.equal(verifier.mock.callCount(), 3);
  assert.equal(getRateLimitIdentity(req), null);

  const replacement = jwt.sign({ ...claims, userId: "user-2" }, secret, { expiresIn: "1h" });
  req.headers.authorization = `Bearer ${replacement}`;
  prime(req);
  assert.equal(getRateLimitIdentity(req), "user-2");
  assert.equal(verifier.mock.callCount(), 4);
  req.headers.authorization = `Bearer ${token}`;
  assert.equal(getRateLimitIdentity(req), null);
});

test("anonymous, expired, forged, malformed and untrusted client identity inputs never become quota identities", () => {
  const valid = jwt.sign(claims, secret, { expiresIn: "1h" });
  const [header, , signature] = valid.split(".");
  const changedPayload = Buffer.from(JSON.stringify({ ...claims, userId: "victim" })).toString("base64url");
  const tokens = [
    "broken",
    jwt.sign(claims, "attacker-secret", { expiresIn: "1h" }),
    jwt.sign(claims, secret, { expiresIn: -1 }),
    jwt.sign({ userId: "victim" }, secret, { expiresIn: "1h" }),
    `${header}.${changedPayload}.${signature}`,
    jwt.sign(claims, "", { algorithm: "none" }),
  ];
  for (const token of tokens) {
    const req = createRequest({ authorization: `Bearer ${token}`, "x-user-id": "victim", "x-role": "superuser" });
    prime(req);
    assert.equal(getRateLimitIdentity(req), null);
  }
  const anonymous = createRequest({ "x-user-id": "victim" });
  Object.assign(anonymous, { body: { userId: "victim" }, query: { userId: "victim" } });
  prime(anonymous);
  assert.equal(getRateLimitIdentity(anonymous), null);
});

test("invalid verification is not repeated at route auth and Bearer precedence matches existing auth", (t) => {
  const cookie = jwt.sign(claims, secret, { expiresIn: "1h" });
  const invalid = jwt.sign(claims, "wrong-secret", { expiresIn: "1h" });
  const req = createRequest({ authorization: `Bearer ${invalid}`, cookie: `sqr_auth=${cookie}` });
  const verifier = t.mock.method(jwt, "verify");
  prime(req);
  assert.equal(readRequestSessionToken(req).source, "bearer");
  assert.equal(getRateLimitIdentity(req), null);
  assert.throws(() => verifyRequestSessionIdentity(req, invalid, secret));
  assert.equal(verifier.mock.callCount(), 1);
});

test("cached verification never extends JWT expiry while a request awaits rate-limit storage", (t) => {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const token = jwt.sign({ ...claims, iat: issuedAt, exp: issuedAt + 60 }, secret);
  const req = createRequest({ authorization: `Bearer ${token}` });
  prime(req);
  assert.equal(getRateLimitIdentity(req), "user-1");
  t.mock.method(Date, "now", () => (issuedAt + 60) * 1_000);
  assert.equal(getRateLimitIdentity(req), null);
  assert.throws(() => verifyRequestSessionIdentity(req, token, secret), /jwt expired/);
});

test("non-API public assets skip session verification", (t) => {
  const token = jwt.sign(claims, secret, { expiresIn: "1h" });
  const req = { headers: { cookie: `sqr_auth=${token}` }, path: "/assets/app.js" } as Request;
  const verifier = t.mock.method(jwt, "verify");
  prime(req);
  assert.equal(getRateLimitIdentity(req), null);
  assert.equal(verifier.mock.callCount(), 0);
});
