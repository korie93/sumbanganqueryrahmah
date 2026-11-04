import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuditLogsReadKey,
  createAuditLogsReadState,
  reduceAuditLogsReadState,
  selectAuditLogsReadView,
} from "@/pages/audit-logs/audit-logs-read-state";
import { DEFAULT_AUDIT_LOG_FILTERS } from "@/pages/audit-logs/audit-log-page-state-utils";
import type { AuditLogsResponse } from "@/pages/audit-logs/types";

function response(id?: string): AuditLogsResponse {
  return {
    logs: id ? [{ id, action: "LOGIN_SUCCESS", performedBy: "synthetic.operator", timestamp: "2026-11-04T00:00:00.000Z" }] : [],
    pagination: { mode: "offset", page: 1, pageSize: 20, limit: 20, offset: 0, total: id ? 1 : 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  };
}

test("initial 503 is an error rather than a successful empty result, and retry can recover", () => {
  const key = buildAuditLogsReadKey(DEFAULT_AUDIT_LOG_FILTERS, 1, 20, 0);
  let state = reduceAuditLogsReadState(createAuditLogsReadState(), { type: "loading", requestId: 1, queryKey: key });
  state = reduceAuditLogsReadState(state, { type: "error", requestId: 1, queryKey: key, error: "Service unavailable" });
  const failed = selectAuditLogsReadView(state, key, 1, 20);
  assert.equal(failed.hasCurrentResults, false);
  assert.equal(failed.loading, false);
  assert.equal(failed.error, "Service unavailable");
  assert.deepEqual(failed.logs, []);
  const retry = buildAuditLogsReadKey(DEFAULT_AUDIT_LOG_FILTERS, 1, 20, 1);
  assert.equal(selectAuditLogsReadView(state, retry, 1, 20).loading, true);
  state = reduceAuditLogsReadState(state, { type: "loading", requestId: 2, queryKey: retry });
  state = reduceAuditLogsReadState(state, { type: "success", requestId: 2, queryKey: retry, response: response(), page: 1, pageSize: 20 });
  const recovered = selectAuditLogsReadView(state, retry, 1, 20);
  assert.equal(recovered.error, "");
  assert.equal(recovered.hasCurrentResults, true);
  assert.deepEqual(recovered.logs, [], "Only successful reads may produce a true empty result");
});

test("changing a filter immediately hides old results and failed reads never re-enable stale export", () => {
  const original = buildAuditLogsReadKey(DEFAULT_AUDIT_LOG_FILTERS, 1, 20, 0);
  let state = reduceAuditLogsReadState(createAuditLogsReadState(), { type: "loading", requestId: 1, queryKey: original });
  state = reduceAuditLogsReadState(state, { type: "success", requestId: 1, queryKey: original, response: response("old"), page: 1, pageSize: 20 });
  assert.equal(selectAuditLogsReadView(state, original, 1, 20).logs[0]?.id, "old");
  const changed = buildAuditLogsReadKey({ ...DEFAULT_AUDIT_LOG_FILTERS, riskFilter: "critical" }, 1, 20, 0);
  assert.deepEqual(selectAuditLogsReadView(state, changed, 1, 20).logs, [], "No effect needs to run to hide the previous query");
  state = reduceAuditLogsReadState(state, { type: "loading", requestId: 2, queryKey: changed });
  state = reduceAuditLogsReadState(state, { type: "error", requestId: 2, queryKey: changed, error: "Try again" });
  const failed = selectAuditLogsReadView(state, changed, 1, 20);
  assert.equal(failed.hasPreviousResults, true);
  assert.equal(failed.hasCurrentResults, false);
  assert.deepEqual(failed.logs, []);
  assert.equal(failed.pagination.total, 0);
});

test("late successes and errors cannot replace a newer request, including retry of the same query", () => {
  let state = reduceAuditLogsReadState(createAuditLogsReadState(), { type: "loading", requestId: 1, queryKey: "first" });
  state = reduceAuditLogsReadState(state, { type: "loading", requestId: 2, queryKey: "second" });
  const pending = state;
  state = reduceAuditLogsReadState(state, { type: "success", requestId: 1, queryKey: "first", response: response("old"), page: 1, pageSize: 20 });
  assert.equal(state, pending);
  state = reduceAuditLogsReadState(state, { type: "success", requestId: 2, queryKey: "second", response: response("new"), page: 1, pageSize: 20 });
  const ready = state;
  assert.equal(reduceAuditLogsReadState(state, { type: "error", requestId: 1, queryKey: "first", error: "Old failure" }), ready);
  state = reduceAuditLogsReadState(state, { type: "loading", requestId: 3, queryKey: "second" });
  assert.equal(reduceAuditLogsReadState(state, { type: "error", requestId: 2, queryKey: "second", error: "Earlier failure" }), state);
});

test("raw and deferred search identity, pagination and refresh cannot share exportable results", () => {
  const filters = { ...DEFAULT_AUDIT_LOG_FILTERS, searchText: " new request " };
  const desired = buildAuditLogsReadKey(filters, 1, 20, 0);
  assert.notEqual(desired, buildAuditLogsReadKey(filters, 1, 20, 0, "old request"));
  assert.equal(desired, buildAuditLogsReadKey(filters, 1, 20, 0, "new request"));
  assert.notEqual(desired, buildAuditLogsReadKey(filters, 2, 20, 0));
  assert.notEqual(desired, buildAuditLogsReadKey(filters, 1, 50, 0));
  assert.notEqual(desired, buildAuditLogsReadKey(filters, 1, 20, 1));
});
