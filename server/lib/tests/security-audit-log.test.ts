import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSecurityAuditDetails,
  hashSecurityAuditIdentifier,
  sanitizeSecurityAuditMetadata,
  verifySecurityAuditDetails,
} from "../security-audit-log";

const HMAC_KEY = "security-audit-test-key-48-characters-minimum";

test("security audit details are tamper-evident and hide raw identifiers", () => {
  const details = buildSecurityAuditDetails({
    event: "AUTH_LOGIN_SUCCESS",
    outcome: "success",
    actorId: "user-123",
    ipAddress: "203.0.113.10",
    metadata: {
      role: "admin",
      mfa_used: true,
    },
    requestId: "req-1",
    timestamp: "2026-05-31T00:00:00.000Z",
    userAgent: "Chromium",
  }, { hmacKey: HMAC_KEY });

  assert.equal(details.includes("user-123"), false);
  assert.equal(details.includes("203.0.113.10"), false);
  assert.match(details, /"hmac":/);

  const verification = verifySecurityAuditDetails(details, { hmacKey: HMAC_KEY });
  assert.equal(verification.ok, true);
  if (verification.ok) {
    assert.equal(verification.entry.event, "AUTH_LOGIN_SUCCESS");
    assert.equal(verification.entry.actor_hash, hashSecurityAuditIdentifier("user-123", HMAC_KEY));
    assert.equal(verification.entry.ip_hash, hashSecurityAuditIdentifier("203.0.113.10", HMAC_KEY));
  }
});

test("security audit verification detects tampering", () => {
  const details = buildSecurityAuditDetails({
    event: "AUTH_LOGIN_FAILURE",
    outcome: "failure",
    actorId: "user-123",
    metadata: { reason: "invalid_password" },
    timestamp: "2026-05-31T00:00:00.000Z",
  }, { hmacKey: HMAC_KEY });

  const tampered = details.replace("invalid_password", "admin_override");
  assert.deepEqual(
    verifySecurityAuditDetails(tampered, { hmacKey: HMAC_KEY }),
    { ok: false, reason: "invalid_hmac" },
  );
});

test("security audit metadata drops sensitive keys", () => {
  assert.deepEqual(sanitizeSecurityAuditMetadata({
    password: "secret",
    session_id: "activity-1",
    auth_token: "jwt",
    role: "admin",
    retry_count: 2,
  }), {
    role: "admin",
    retry_count: 2,
  });
});
