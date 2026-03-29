import assert from "node:assert/strict";
import test from "node:test";
import { getAuditActionInfo, getAuditActionLabel } from "@/pages/audit-logs/utils";

test("getAuditActionLabel returns friendlier labels for known audit actions", () => {
  assert.equal(getAuditActionLabel("LOGIN_BLOCKED_SINGLE_SESSION"), "Single Session Blocked");
  assert.equal(getAuditActionLabel("COLLECTION_NICKNAME_PASSWORD_SET"), "Nickname Password Set");
});

test("getAuditActionLabel humanizes unknown audit actions safely", () => {
  assert.equal(getAuditActionLabel("PASSWORD_RESET_REQUEST_CREATED"), "Password Reset Request Created");
});

test("getAuditActionInfo preserves raw action codes while using a safe fallback badge variant", () => {
  assert.deepEqual(getAuditActionInfo("PASSWORD_RESET_REQUEST_CREATED"), {
    label: "Password Reset Request Created",
    rawAction: "PASSWORD_RESET_REQUEST_CREATED",
    variant: "outline",
  });
});
