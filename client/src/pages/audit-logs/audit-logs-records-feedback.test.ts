import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditLogsRecordsList } from "@/pages/audit-logs/AuditLogsRecordsList";

function render(loading: boolean, unavailable: boolean) {
  return renderToStaticMarkup(createElement(AuditLogsRecordsList, {
    loading, unavailable, filteredLogs: [], totalLogs: 0, recordsOpen: true,
    onClearFilters: () => {}, onRecordsOpenChange: () => {}, onTraceRequestId: () => {},
  }));
}

test("unavailable audit records never announce a successful empty result", () => {
  const html = render(false, true);
  assert.match(html, /Audit records are unavailable for the current filters\./);
  assert.doesNotMatch(html, /No audit records found|No records match the filters/);
});

test("pending audit reads communicate loading instead of true empty", () => {
  const html = render(true, true);
  assert.match(html, /role="status"/);
  assert.match(html, /Loading audit records/);
  assert.doesNotMatch(html, /No audit records found/);
});

test("a successful empty audit read retains the established empty feedback", () => {
  assert.match(render(false, false), /No audit records found\./);
});
