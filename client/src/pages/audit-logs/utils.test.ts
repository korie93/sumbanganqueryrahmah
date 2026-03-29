import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuditActionInfo,
  getAuditActionLabel,
  getAuditDetailsPreview,
  shouldCollapseAuditDetails,
} from "@/pages/audit-logs/utils";

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

test("getAuditDetailsPreview collapses dense audit payloads into a mobile-friendly summary", () => {
  const preview = getAuditDetailsPreview('{"query":"931010115115","branch":"Kuala Terengganu","decision":null}', 30);
  assert.equal(preview, '{"query":"931010115115","bran…');
});

test("shouldCollapseAuditDetails only collapses long detail payloads", () => {
  assert.equal(shouldCollapseAuditDetails("Login from Chrome 146", 40), false);
  assert.equal(shouldCollapseAuditDetails('{"query":"931010115115","branch":"Kuala Terengganu"}', 24), true);
});
