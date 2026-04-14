import assert from "node:assert/strict";
import test from "node:test";
import { buildAuditLogRowAriaLabel } from "@/pages/audit-logs/audit-log-row-aria";

test("buildAuditLogRowAriaLabel summarizes actor and target details", () => {
  assert.equal(
    buildAuditLogRowAriaLabel({
      actionLabel: "Delete User",
      formattedTimestamp: "14/04/2026, 08:30 PM",
      log: {
        action: "DELETE_USER",
        details: "Deleted inactive account",
        id: "audit-1",
        performedBy: "superuser",
        targetResource: "user:42",
        targetUser: "operator.one",
        timestamp: "2026-04-14T12:30:00.000Z",
      },
    }),
    "Audit log Delete User, performed by superuser, recorded 14/04/2026, 08:30 PM, target user operator.one, resource user:42",
  );
});
