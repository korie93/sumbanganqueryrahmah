import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuditLogSummary,
  getAuditCategoryInfo,
  getAuditChangeSummary,
  getAuditRiskInfo,
} from "@/pages/audit-logs/audit-log-classification";

test("getAuditRiskInfo classifies destructive and routine actions", () => {
  assert.equal(getAuditRiskInfo("RESTORE_BACKUP").level, "critical");
  assert.equal(getAuditRiskInfo("LOGIN_FAILED_PASSWORD").level, "high");
  assert.equal(getAuditRiskInfo("COLLECTION_RECORD_CREATED").level, "medium");
  assert.equal(getAuditRiskInfo("LOGOUT").level, "low");
});

test("getAuditCategoryInfo groups audit actions into readable domains", () => {
  assert.equal(getAuditCategoryInfo("RESTORE_BACKUP").label, "Backup");
  assert.equal(getAuditCategoryInfo("COLLECTION_RECORD_CREATED").label, "Collection");
  assert.equal(getAuditCategoryInfo("LOGIN_BLOCKED_SINGLE_SESSION").label, "Security");
  assert.equal(getAuditCategoryInfo("CRITICAL_SETTING_UPDATED").label, "Settings");
});

test("getAuditChangeSummary extracts before and after object changes", () => {
  assert.deepEqual(
    getAuditChangeSummary(JSON.stringify({
      before: { status: "AL", note: "Annual leave" },
      after: { status: "RL", note: "Replacement leave" },
    })),
    [
      { field: "Note", before: "Annual leave", after: "Replacement leave" },
      { field: "Status", before: "AL", after: "RL" },
    ],
  );
});

test("getAuditChangeSummary extracts old/new field pairs", () => {
  assert.deepEqual(
    getAuditChangeSummary(JSON.stringify({ oldRole: "user", newRole: "admin" })),
    [{ field: "Role", before: "user", after: "admin" }],
  );
});

test("buildAuditLogSummary keeps derived metadata side-effect free", () => {
  const summary = buildAuditLogSummary({
    action: "DELETE_BACKUP",
    details: JSON.stringify({ oldStatus: "active", newStatus: "deleted" }),
    id: "audit-1",
    performedBy: "superuser",
    targetResource: "backup-1",
    timestamp: "2026-05-18T00:00:00.000Z",
  });

  assert.equal(summary.category.label, "Backup");
  assert.equal(summary.risk.level, "critical");
  assert.deepEqual(summary.changes, [{ field: "Status", before: "active", after: "deleted" }]);
});
