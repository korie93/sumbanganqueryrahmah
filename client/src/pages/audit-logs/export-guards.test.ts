import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuditLogsExportBlockReason } from "@/pages/audit-logs/export-guards";

test("resolveAuditLogsExportBlockReason blocks empty exports", () => {
  assert.equal(
    resolveAuditLogsExportBlockReason({
      logsLength: 0,
      exportingPdf: false,
    }),
    "no_data",
  );
});

test("resolveAuditLogsExportBlockReason blocks busy exports", () => {
  assert.equal(
    resolveAuditLogsExportBlockReason({
      logsLength: 10,
      exportingPdf: true,
    }),
    "busy",
  );
});

test("resolveAuditLogsExportBlockReason allows export when data is ready", () => {
  assert.equal(
    resolveAuditLogsExportBlockReason({
      logsLength: 10,
      exportingPdf: false,
    }),
    null,
  );
});
