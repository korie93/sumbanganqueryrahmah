import assert from "node:assert/strict";
import test from "node:test";
import { runWithRequestContext } from "../request-context";
import { verifySecurityAuditDetails } from "../security-audit-log";
import { buildLoginFailureAuditDetails } from "../login-audit";

test("buildLoginFailureAuditDetails records a validated exact network without secrets", () => {
  const details = runWithRequestContext({
    requestId: "request-login-failure",
    clientIp: "203.0.113.42",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  }, () => buildLoginFailureAuditDetails({
    browserName: "Chrome 149",
    failureReason: "invalid_password",
    ipAddress: "203.0.113.42",
    message: "Password login failed.",
    role: "manager",
  }));

  assert.equal(details.includes("203.0.113.42"), true);
  assert.equal(details.toLowerCase().includes("password123"), false);
  assert.equal(details.toLowerCase().includes("token"), false);

  const verified = verifySecurityAuditDetails(details);
  assert.equal(verified.ok, true);
  if (!verified.ok) return;

  assert.equal(verified.entry.event, "AUTH_LOGIN_FAILURE");
  assert.equal(verified.entry.outcome, "failure");
  assert.equal(verified.entry.metadata.browser, "Chrome 149");
  assert.equal(verified.entry.metadata.failure_reason, "invalid_password");
  assert.equal(verified.entry.metadata.network, "203.0.113.42");
  assert.equal(verified.entry.metadata.platform, "Windows 10/11");
  assert.equal(
    verified.entry.metadata.user_agent_summary,
    "Chrome 149 on Windows 10/11",
  );
});

test("buildLoginFailureAuditDetails rejects an untrusted forwarded IP list", () => {
  const details = buildLoginFailureAuditDetails({
    browserName: "Unknown browser",
    failureReason: "invalid_password",
    ipAddress: "203.0.113.42, 10.0.0.1",
    message: "Password login failed.",
  });
  const verified = verifySecurityAuditDetails(details);

  assert.equal(verified.ok, true);
  if (!verified.ok) return;
  assert.equal(verified.entry.ip_hash, null);
  assert.equal(verified.entry.metadata.network, null);
});
