import assert from "node:assert/strict";
import test from "node:test";
import type { AuditLogRecord } from "@/pages/audit-logs/types";
import { buildAuditLogsCsvContent } from "@/pages/audit-logs/audit-logs-export";

const sampleLogs: AuditLogRecord[] = [
  {
    id: "audit-1",
    action: "LOGIN_SUCCESS",
    performedBy: "superuser",
    targetUser: "target-user",
    targetResource: "resource-123",
    details: 'User clicked "Login"',
    timestamp: "2026-03-29T16:30:00.000Z",
  },
];

test("buildAuditLogsCsvContent includes headers and localized timestamps", () => {
  const csvContent = buildAuditLogsCsvContent(sampleLogs);

  assert.match(csvContent, /^"Action","Performed By","Target User","Resource","Details","Timestamp"/);
  assert.match(csvContent, /"Login Success"/);
  assert.match(csvContent, /"30\/03\/2026, 12:30:00 AM"/);
});

test("buildAuditLogsCsvContent escapes quotes safely", () => {
  const csvContent = buildAuditLogsCsvContent(sampleLogs);

  assert.match(csvContent, /"User clicked ""Login"""/);
});
