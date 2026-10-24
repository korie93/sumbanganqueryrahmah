import assert from "node:assert/strict";
import test from "node:test";
import { getAccountAccessBlockReason, isManageableUserRole } from "../../server/auth/account-lifecycle";
import {
  parseAuthenticatedSessionJwtPayload,
  parseWebSocketSessionJwtPayload,
} from "../../server/auth/session-jwt-payload";
import { isCredentialPasswordPolicyCompliant } from "../../shared/password-policy";

// Synthetic claims only. These tests validate parsing/lifecycle policy, not signatures,
// DB-backed authorization, token consumption, or real HTTP/WS authentication.
const claims = {
  userId: "audit-user-a",
  username: "audit.user.a",
  activityId: "audit-activity-a",
  role: "user",
  jti: "audit-session-a",
};

for (const key of ["userId", "username", "activityId", "role"] as const) {
  test(`HTTP identity rejects a missing or blank ${key}`, () => {
    const missing: Record<string, unknown> = { ...claims };
    delete missing[key];
    assert.throws(() => parseAuthenticatedSessionJwtPayload(missing));
    assert.throws(() => parseAuthenticatedSessionJwtPayload({ ...claims, [key]: "  " }));
  });
}

for (const extra of [
  { purpose: "two_factor_login" },
  { permissions: ["settings", "backup"] },
  { isSuperuser: true },
  { tenantId: "audit-other-tenant" },
]) {
  test(`HTTP session schema rejects unexpected authority field ${Object.keys(extra)[0]}`, () => {
    assert.throws(() => parseAuthenticatedSessionJwtPayload({ ...claims, ...extra }));
  });
}

for (const key of ["iat", "exp", "nbf"] as const) {
  test(`numeric-date claim ${key} rejects strings, negative, fractional and nonfinite values`, () => {
    for (const value of ["123", -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => parseAuthenticatedSessionJwtPayload({ ...claims, [key]: value }));
    }
  });
}

test("WS claims require both an activity and a revocable JWT identifier", () => {
  assert.deepEqual(parseWebSocketSessionJwtPayload({ activityId: claims.activityId, jti: claims.jti }), {
    activityId: claims.activityId,
    jti: claims.jti,
  });
  for (const value of [
    {}, { activityId: claims.activityId }, { activityId: claims.activityId, jti: " " },
    { activityId: " ", jti: claims.jti },
    { activityId: claims.activityId, jti: claims.jti, purpose: "two_factor_login" },
  ]) {
    assert.throws(() => parseWebSocketSessionJwtPayload(value));
  }
});

for (const role of ["user", "admin", "manager", "superuser"]) {
  test(`${role} cannot use an explicitly blocked account lifecycle`, () => {
    const active = { role, status: "active", isBanned: false };
    assert.equal(getAccountAccessBlockReason(active), null);
    assert.equal(getAccountAccessBlockReason({ ...active, isBanned: true }), "banned");
    assert.equal(getAccountAccessBlockReason({ ...active, lockedAt: "2026-01-01T00:00:00Z" }), "locked");
    for (const status of ["pending_activation", "suspended", "disabled", "deleted"]) {
      assert.notEqual(getAccountAccessBlockReason({ ...active, status }), null);
    }
  });
}

test("managed roles never include superuser or unknown privilege names", () => {
  for (const role of ["superuser", "root", "owner", "", null, undefined]) {
    assert.equal(isManageableUserRole(role), false);
  }
});

test("chosen-password policy is not replaced by the short temporary-password policy", () => {
  assert.equal(isCredentialPasswordPolicyCompliant("AuditOnlyLong42!"), true);
  for (const value of ["Abcd12!x", "auditonlylong42!", "AUDITONLYLONG42!", "AuditOnlyLongxx!", "AuditOnlyLong42x", "Aa1!" + "x".repeat(253)]) {
    assert.equal(isCredentialPasswordPolicyCompliant(value), false);
  }
});
