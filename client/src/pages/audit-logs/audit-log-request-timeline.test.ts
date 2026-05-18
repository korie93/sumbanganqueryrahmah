import assert from "node:assert/strict";
import test from "node:test";
import { buildAuditRequestTimeline } from "@/pages/audit-logs/audit-log-request-timeline";
import type { AuditLogRecord } from "@/pages/audit-logs/types";

function buildLog(id: string, timestamp: string, requestId = "api-request-1"): AuditLogRecord {
  return {
    action: id === "1" ? "LOGIN_FAILED_PASSWORD" : "RESTORE_BACKUP",
    id,
    performedBy: "superuser",
    requestId,
    targetUser: "admin",
    timestamp,
  };
}

test("buildAuditRequestTimeline filters by request id and sorts oldest first", () => {
  const timeline = buildAuditRequestTimeline(
    [
      buildLog("2", "2026-05-18T00:02:00.000Z"),
      buildLog("other", "2026-05-18T00:01:00.000Z", "api-other"),
      buildLog("1", "2026-05-18T00:00:00.000Z"),
    ],
    "api-request-1",
  );

  assert.deepEqual(timeline.map((entry) => entry.id), ["1", "2"]);
  assert.deepEqual(timeline.map((entry) => entry.riskLabel), ["High", "Critical"]);
});

test("buildAuditRequestTimeline returns empty results without a request id", () => {
  assert.deepEqual(buildAuditRequestTimeline([buildLog("1", "2026-05-18T00:00:00.000Z")], ""), []);
});

