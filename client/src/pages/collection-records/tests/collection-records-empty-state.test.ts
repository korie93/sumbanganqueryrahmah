import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionRecordsEmptyState, type CollectionRecordsEmptyStateProps } from "../CollectionRecordsEmptyState";
import { CollectionRecordsTable } from "../CollectionRecordsTable";
import { buildCollectionRecordFilterSnapshot, getCollectionRecordsRecoveryState } from "../collection-record-filters";
import type { CollectionRecordFilters } from "../types";

const render = (props: CollectionRecordsEmptyStateProps = {}) => renderToStaticMarkup(createElement(CollectionRecordsEmptyState, {
  onClearSearch() {}, onResetFilters() {}, onReloadRecords() {}, ...props,
}));

test("empty unfiltered records explain the access scope without suggesting a destructive or useless action", () => {
  const html = render();
  assert.match(html, /Tiada rekod untuk dipaparkan/);
  assert.match(html, /skop akses anda/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /<button|Tiada rekod sepadan/);
});

test("empty recovery offers only actions relevant to the current search and filters", () => {
  const search = render({ hasSearch: true });
  assert.match(search, /Tiada rekod sepadan/);
  assert.match(search, /Kosongkan carian/);
  assert.doesNotMatch(search, /Reset penapis/);
  const filtered = render({ hasFilters: true });
  assert.match(filtered, /Reset penapis/);
  assert.doesNotMatch(filtered, /Kosongkan carian/);
  const both = render({ hasSearch: true, hasFilters: true });
  assert.equal((both.match(/<button /g) ?? []).length, 2);
  assert.match(both, /tidak memadam rekod/);
  assert.match(both, /min-h-11 sm:min-h-11/);
});

test("failed loading is not presented as zero matching records or a reason to clear filters", () => {
  const html = render({ recordsLoadFailed: true, hasSearch: true, hasFilters: true });
  assert.match(html, /Rekod tidak dapat dimuatkan/);
  assert.match(html, /Cuba semula/);
  assert.match(html, /Carian dan penapis anda dikekalkan/);
  assert.doesNotMatch(html, /Tiada rekod|Kosongkan carian|Reset penapis/);
});

test("optional empty-state callbacks never create nonfunctional buttons", () => {
  assert.doesNotMatch(render({ hasSearch: true, hasFilters: true, onClearSearch: undefined, onResetFilters: undefined }), /<button/);
  assert.doesNotMatch(render({ recordsLoadFailed: true, onReloadRecords: undefined }), /<button/);
});

test("loading takes precedence over empty-state recovery and mode controls", () => {
  const html = renderToStaticMarkup(createElement(CollectionRecordsTable, {
    loadingRecords: true, recordsLoadFailed: true, visibleRecords: [], paginatedRecords: [], pageOffset: 0,
    canEdit: false, canDeleteRow: () => false, onEdit() {}, onDelete() {}, onViewReceipt() {},
    hasSearch: true, hasFilters: true, onClearSearch() {}, onResetFilters() {},
  }));
  assert.match(html, /Loading records/);
  assert.doesNotMatch(html, /<button|Tiada rekod|Rekod tidak dapat|Paparan rekod/);
});

test("recovery recognizes every narrowing filter, but not sorting and pagination", () => {
  assert.deepEqual(getCollectionRecordsRecoveryState({}), { hasSearch: false, hasFilters: false });
  assert.deepEqual(getCollectionRecordsRecoveryState({ search: "  " }), { hasSearch: false, hasFilters: false });
  assert.deepEqual(getCollectionRecordsRecoveryState({ search: "test", sortBy: "amount", sortDirection: "asc", limit: 50, cursor: "next" }),
    { hasSearch: true, hasFilters: false });
  const filtersToCheck: CollectionRecordFilters[] = [
    { from: "2026-10-01" }, { to: "2026-10-05" }, { nickname: "Synthetic" }, { leaderId: "team-1" },
    { sourceImportIds: ["source-1"] }, { agingBuckets: ["D4"] }, { classifications: ["cp"] },
  ];
  for (const filters of filtersToCheck) {
    const snapshot = { ...filters };
    assert.equal(getCollectionRecordsRecoveryState(snapshot).hasFilters, true);
    assert.deepEqual(snapshot, filters);
  }
});

test("recovery follows role-filter normalization and all/default sentinel semantics", () => {
  const unauthorized = buildCollectionRecordFilterSnapshot({ canUseNicknameFilter: false, canUseTeamLeaderFilter: false,
    nicknameFilter: "Synthetic", leaderFilter: "team-1", sourceImportFilter: "all", agingFilter: "all", classificationFilter: "all" });
  assert.deepEqual(getCollectionRecordsRecoveryState(unauthorized), { hasSearch: false, hasFilters: false });
  for (const specific of [{ sourceImportFilter: "source-1" }, { agingFilter: "D4" }, { classificationFilter: "abort_cp" }]) {
    const snapshot = buildCollectionRecordFilterSnapshot({ canUseNicknameFilter: false, ...specific });
    assert.equal(getCollectionRecordsRecoveryState(snapshot).hasFilters, true);
  }
});
