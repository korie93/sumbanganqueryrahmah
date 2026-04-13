import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import {
  buildAuthRouteRateLimitSubject,
  buildRequestRateLimitFingerprint,
  normalizeAuthRateLimitIdentifier,
} from "../rate-limit";

function createRequest(
  headers: Record<string, string | undefined> = {},
  ip = "203.0.113.10",
  body: Record<string, unknown> | undefined = undefined,
) {
  return {
    ip,
    body,
    socket: {
      remoteAddress: "10.0.0.10",
    },
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Request;
}

test("buildRequestRateLimitFingerprint keeps the network identity and normalized client hints", () => {
  const req = createRequest({
    "user-agent": " Mozilla/5.0  ",
    "accept-language": " en-US,en;q=0.9 ",
  });

  assert.deepEqual(buildRequestRateLimitFingerprint(req), [
    "203.0.113.10",
    "peer:10.0.0.10",
    "ua:mozilla/5.0",
    "lang:en-us,en;q=0.9",
  ]);
});

test("buildRequestRateLimitFingerprint omits empty headers safely", () => {
  const req = createRequest({
    "user-agent": "   ",
    "accept-language": undefined,
  }, "198.51.100.8");

  assert.deepEqual(buildRequestRateLimitFingerprint(req), [
    "198.51.100.8",
    "peer:10.0.0.10",
  ]);
});

test("buildRequestRateLimitFingerprint avoids duplicating the direct peer when it matches req.ip", () => {
  const req = {
    ip: "198.51.100.8",
    socket: {
      remoteAddress: "198.51.100.8",
    },
    get() {
      return undefined;
    },
  } as unknown as Request;

  assert.deepEqual(buildRequestRateLimitFingerprint(req), ["198.51.100.8"]);
});

test("normalizeAuthRateLimitIdentifier trims and lowercases supported identifiers", () => {
  assert.equal(normalizeAuthRateLimitIdentifier(" Admin.User "), "admin.user");
  assert.equal(normalizeAuthRateLimitIdentifier(""), null);
  assert.equal(normalizeAuthRateLimitIdentifier(123), null);
});

test("buildAuthRouteRateLimitSubject keeps auth identifiers stable across casing and field aliases", () => {
  const fromUsername = createRequest({}, "203.0.113.10", {
    username: " Admin.User ",
  });
  const fromIdentifier = createRequest({}, "203.0.113.10", {
    identifier: "admin.user",
  });
  const fromEmail = createRequest({}, "203.0.113.10", {
    email: " ADMIN.USER ",
  });

  assert.equal(
    buildAuthRouteRateLimitSubject(fromUsername, "auth-login"),
    buildAuthRouteRateLimitSubject(fromIdentifier, "auth-login"),
  );
  assert.equal(
    buildAuthRouteRateLimitSubject(fromIdentifier, "auth-recovery:/api/auth/request-password-reset"),
    buildAuthRouteRateLimitSubject(fromEmail, "auth-recovery:/api/auth/request-password-reset"),
  );
});

test("buildAuthRouteRateLimitSubject ignores malformed request bodies safely", () => {
  const malformed = createRequest({}, "203.0.113.10", {
    username: 42,
  });

  assert.equal(buildAuthRouteRateLimitSubject(malformed, "auth-login"), null);
});
