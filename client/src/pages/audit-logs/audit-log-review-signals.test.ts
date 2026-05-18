import assert from "node:assert/strict";
import test from "node:test";
import { getAuditReviewSignals } from "@/pages/audit-logs/audit-log-review-signals";
import type { AuditLogRecord } from "@/pages/audit-logs/types";

function buildLog(action: string, details = ""): AuditLogRecord {
  return {
    action,
    details,
    id: `audit-${action}`,
    performedBy: "superuser",
    requestId: "api-request-1",
    timestamp: "2026-05-18T00:00:00.000Z",
  };
}

test("getAuditReviewSignals flags destructive critical actions", () => {
  const signals = getAuditReviewSignals(buildLog("RESTORE_BACKUP"));

  assert.equal(signals.some((signal) => signal.code === "critical-risk"), true);
  assert.equal(signals.some((signal) => signal.code === "destructive-action"), true);
});

test("getAuditReviewSignals flags authentication concerns", () => {
  const signals = getAuditReviewSignals(buildLog("LOGIN_FAILED_PASSWORD"));

  assert.equal(signals.some((signal) => signal.code === "high-risk"), true);
  assert.equal(signals.some((signal) => signal.code === "auth-concern"), true);
});

test("getAuditReviewSignals keeps routine logs quiet", () => {
  assert.deepEqual(getAuditReviewSignals(buildLog("LOGOUT")), []);
});

test("getAuditReviewSignals flags failure details without duplicating signals", () => {
  const signals = getAuditReviewSignals(buildLog("COLLECTION_RECORD_CREATED", "operation failed in worker"));

  assert.equal(signals.filter((signal) => signal.code === "failure-detail").length, 1);
});

