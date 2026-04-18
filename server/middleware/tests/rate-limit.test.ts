import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { Request } from "express";
import { ERROR_CODES } from "../../../shared/error-codes";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import {
  buildAuthRouteRateLimitSubject,
  buildRequestRateLimitFingerprint,
  createRateLimitKeyAdmissionController,
  createImportsUploadRateLimiter,
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

test("createRateLimitKeyAdmissionController collapses excessive unique subjects into an overflow bucket", () => {
  let now = 10_000;
  const controller = createRateLimitKeyAdmissionController({
    maxBuckets: 2,
    maxSuffixesPerBucket: 2,
    now: () => now,
    ttlMs: 1_000,
  });

  assert.equal(controller.admit("auth-login|203.0.113.10", "acct:one"), "acct:one");
  assert.equal(controller.admit("auth-login|203.0.113.10", "acct:two"), "acct:two");
  assert.equal(controller.admit("auth-login|203.0.113.10", "acct:three"), "overflow");

  now += 1_500;

  assert.equal(controller.admit("auth-login|203.0.113.10", "acct:three"), "acct:three");
});

test("createImportsUploadRateLimiter throttles repeated upload attempts from the same network", async () => {
  const app = express();
  app.post(
    "/upload",
    createImportsUploadRateLimiter({
      windowMs: 60_000,
      max: 1,
    }),
    (_req, res) => {
      res.status(204).end();
    },
  );

  const { baseUrl, server } = await startTestServer(app);

  try {
    const firstResponse = await fetch(`${baseUrl}/upload`, {
      method: "POST",
    });
    const secondResponse = await fetch(`${baseUrl}/upload`, {
      method: "POST",
    });

    assert.equal(firstResponse.status, 204);
    assert.equal(secondResponse.status, 429);
    assert.deepEqual(await secondResponse.json(), {
      ok: false,
      error: {
        code: ERROR_CODES.IMPORT_UPLOAD_RATE_LIMITED,
        message: "Too many import upload attempts from this network. Please wait before trying again.",
      },
    });
  } finally {
    await stopTestServer(server);
  }
});
