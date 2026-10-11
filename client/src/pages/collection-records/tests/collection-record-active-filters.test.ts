import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionRecordsActiveFilters } from "../collection-record-active-filters";
import type { CollectionRecordsFiltersProps } from "../CollectionRecordsFilters";

function controls(overrides: Partial<CollectionRecordsFiltersProps> = {}): CollectionRecordsFiltersProps {
  return {
    canUseNicknameFilter: true, canUseTeamLeaderFilter: true,
    fromDate: "", toDate: "", searchInput: "", nicknameFilter: "all", leaderFilter: "all",
    sourceImportFilter: "all", agingFilter: "all", classificationFilter: "all", sortValue: "paymentDate_desc",
    nicknameOptions: [], sourceOptions: [], teamOptions: [],
    loadingNicknames: false, loadingSources: false, loadingTeams: false, loadingRecords: false,
    onFromDateChange: () => undefined, onToDateChange: () => undefined, onSearchInputChange: () => undefined,
    onNicknameFilterChange: () => undefined, onLeaderFilterChange: () => undefined,
    onSourceImportFilterChange: () => undefined, onAgingFilterChange: () => undefined,
    onClassificationFilterChange: () => undefined, onSortValueChange: () => undefined,
    onFilter: () => undefined, onReset: () => undefined,
    ...overrides,
  };
}

const selected = {
  fromDate: "2026-05-01", toDate: "2026-05-31", searchInput: "00009007199254740993",
  nicknameFilter: "Collector A", leaderFilter: "leader-1", sourceImportFilter: "source-1",
  agingFilter: "D4", classificationFilter: "abort_cp", sortValue: "amount_desc",
};

test("active filter count excludes visible Search but includes every other selected control", () => {
  assert.deepEqual(buildCollectionRecordsActiveFilters(controls()), { items: [], filterCount: 0 });
  const searchOnly = buildCollectionRecordsActiveFilters(controls({ searchInput: " 00009007199254740993 " }));
  assert.equal(searchOnly.filterCount, 0);
  assert.equal(searchOnly.items.length, 1);
  assert.equal(searchOnly.items[0]?.label, "Search: 00009007199254740993");
  const all = buildCollectionRecordsActiveFilters(controls(selected));
  assert.equal(all.items.length, 9);
  assert.equal(all.filterCount, 8);
  assert.equal(new Set(all.items.map((item) => item.id)).size, 9);
  assert.equal(all.items.find((item) => item.id === "collection-from-date")?.label, "From 01/05/2026");
  assert.equal(all.items.find((item) => item.id === "collection-to-date")?.label, "To 31/05/2026");
  assert.equal(all.items.find((item) => item.id === "collection-classification")?.label, "Classification: Abort CP");
});

test("each chip removes only its own selected control using the existing reset value", () => {
  const calls: Array<[string, string]> = [];
  const remove = (name: string) => (value: string) => { calls.push([name, value]); };
  const active = buildCollectionRecordsActiveFilters(controls({
    ...selected,
    onFromDateChange: remove("from"), onToDateChange: remove("to"), onSearchInputChange: remove("search"),
    onNicknameFilterChange: remove("nickname"), onLeaderFilterChange: remove("leader"),
    onSourceImportFilterChange: remove("source"), onAgingFilterChange: remove("aging"),
    onClassificationFilterChange: remove("classification"), onSortValueChange: remove("sort"),
    onReset: () => { assert.fail("Removing one chip must not reset every filter"); },
    onFilter: () => { assert.fail("Removing one chip must not manually submit a second query"); },
  }));
  for (const item of active.items) {
    assert.ok(item.onRemove);
    item.onRemove();
  }
  assert.deepEqual(calls, [
    ["from", ""], ["to", ""], ["search", ""], ["nickname", "all"], ["leader", "all"],
    ["source", "all"], ["aging", "all"], ["classification", "all"], ["sort", "paymentDate_desc"],
  ]);
});

test("nickname and leader chip visibility follows query permission gates independently", () => {
  for (const [canUseNicknameFilter, canUseTeamLeaderFilter] of [[false, false], [true, false], [false, true], [true, true]]) {
    const active = buildCollectionRecordsActiveFilters(controls({ ...selected, canUseNicknameFilter, canUseTeamLeaderFilter }));
    assert.equal(active.items.some((item) => item.id === "collection-nickname"), canUseNicknameFilter);
    assert.equal(active.items.some((item) => item.id === "collection-team-leader"), canUseTeamLeaderFilter);
    assert.equal(active.filterCount, 6 + Number(canUseNicknameFilter) + Number(canUseTeamLeaderFilter));
  }
});

test("active chips use readable source and leader labels without exposing fallback identifiers", () => {
  const source: CollectionRecordsFiltersProps["sourceOptions"][number] = {
    sourceImportId: "source-1", sourceImportName: "File A", sourceFilename: "file-a.xlsx", rowCount: 12,
    validFrom: "2026-05-01", validTo: "2026-05-31", cycleKey: "2026-05", enabled: true,
    compatibilityStatus: "compatible", compatibilityIssues: [], indexedRowCount: 12,
    configuredBy: "test-user", configuredAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z", status: "active",
  };
  const label = (overrides: Partial<CollectionRecordsFiltersProps>, id: string) =>
    buildCollectionRecordsActiveFilters(controls({ ...selected, ...overrides })).items.find((item) => item.id === id)?.label;
  assert.equal(label({ sourceOptions: [source] }, "collection-source"), "Source: File A");
  assert.equal(label({ sourceOptions: [{ ...source, sourceImportName: "" }] }, "collection-source"), "Source: file-a.xlsx");
  assert.equal(label({ sourceOptions: [{ ...source, sourceImportName: "", sourceFilename: "" }] }, "collection-source"), "Source: Selected source");
  assert.equal(label({}, "collection-source"), "Source: Selected source");
  assert.equal(label({ teamOptions: [{ id: "leader-1", leaderNickname: "Leader A", staffCount: 4 }] }, "collection-team-leader"), "Leader: Leader A");
  assert.equal(label({}, "collection-team-leader"), "Leader: Selected team");
});

test("chip normalization matches query trimming, invalid filter rejection and sorting defaults", () => {
  const active = buildCollectionRecordsActiveFilters(controls({
    searchInput: "  ", nicknameFilter: " all ", leaderFilter: " all ", sourceImportFilter: " all ",
    agingFilter: "D99", classificationFilter: "invalid", sortValue: "unknown_desc",
  }));
  assert.deepEqual(active, { items: [], filterCount: 0 });
  const normalized = buildCollectionRecordsActiveFilters(controls({ agingFilter: " d3 ", classificationFilter: " CP " }));
  assert.deepEqual(normalized.items.map((item) => item.label), ["Aging: D3", "Classification: CP"]);
  assert.equal(normalized.filterCount, 2);
});

test("every available nondefault sort produces a readable removable chip", () => {
  for (const [sortValue, label] of [
    ["paymentDate_asc", "Tarikh bayaran: terlama"], ["amount_desc", "Jumlah: tertinggi"],
    ["amount_asc", "Jumlah: terendah"], ["source_asc", "Source: A-Z"], ["aging_asc", "Aging: D3-D6"],
    ["classification_asc", "Classification: A-Z"], ["customerName_asc", "Custom order"],
  ]) {
    const active = buildCollectionRecordsActiveFilters(controls({ sortValue }));
    assert.equal(active.filterCount, 1);
    assert.equal(active.items[0]?.id, "collection-sort");
    assert.equal(active.items[0]?.label, `Sort: ${label}`);
    assert.equal(typeof active.items[0]?.onRemove, "function");
  }
});
