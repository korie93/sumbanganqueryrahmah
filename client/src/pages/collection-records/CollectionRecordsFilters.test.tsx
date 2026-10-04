import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionRecordsFilters, type CollectionRecordsFiltersProps } from "@/pages/collection-records/CollectionRecordsFilters";

function renderFilters(overrides: Partial<CollectionRecordsFiltersProps> = {}) {
  return renderToStaticMarkup(
    createElement(CollectionRecordsFilters, {
      canUseNicknameFilter: true,
      canUseTeamLeaderFilter: true,
      fromDate: "2026-05-01",
      toDate: "2026-05-15",
      searchInput: "00009007199254740993",
      nicknameFilter: "all",
      leaderFilter: "all",
      sourceImportFilter: "all",
      agingFilter: "all",
      classificationFilter: "all",
      sortValue: "paymentDate_desc",
      nicknameOptions: [
        { id: "1", nickname: "SW.AFIQAH_1332", isActive: true, roleScope: "both", createdBy: null, createdAt: "2026-05-01T00:00:00.000Z" },
        { id: "2", nickname: "SW.HAZIQ_1042", isActive: true, roleScope: "both", createdBy: null, createdAt: "2026-05-01T00:00:00.000Z" },
      ],
      sourceOptions: [{
        sourceImportId: "source-1",
        sourceImportName: "P10 September",
        sourceFilename: "p10-september.xlsb",
        rowCount: 1511,
        validFrom: "2026-09-01",
        validTo: "2026-09-30",
        cycleKey: "2026-09",
        enabled: true,
        compatibilityStatus: "compatible",
        compatibilityIssues: [],
        indexedRowCount: 1511,
        configuredBy: "superuser",
        configuredAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        status: "active",
      }],
      teamOptions: [{
        id: "11111111-1111-4111-8111-111111111111",
        leaderNickname: "SW.BUKHARI_924",
        staffCount: 7,
      }],
      loadingNicknames: false,
      loadingSources: false,
      loadingTeams: false,
      loadingRecords: false,
      onFromDateChange: () => undefined,
      onToDateChange: () => undefined,
      onSearchInputChange: () => undefined,
      onNicknameFilterChange: () => undefined,
      onLeaderFilterChange: () => undefined,
      onSourceImportFilterChange: () => undefined,
      onAgingFilterChange: () => undefined,
      onClassificationFilterChange: () => undefined,
      onSortValueChange: () => undefined,
      onFilter: () => undefined,
      onReset: () => undefined,
      ...overrides,
    }),
  );
}

test("CollectionRecordsFilters uses the collection nickname picker and compact desktop controls", () => {
  const markup = renderFilters();

  assert.match(markup, /id="collection-records-nickname-filter"/);
  assert.match(markup, /id="collection-records-source-desktop"/);
  assert.match(markup, /id="collection-records-leader-desktop"/);
  assert.match(markup, /id="collection-records-aging-desktop"/);
  assert.match(markup, /id="collection-records-classification-desktop"/);
  assert.match(markup, /id="collection-records-sort-desktop"/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, />Semua staff</);
  assert.match(markup, /h-9 rounded-md bg-background/);
  assert.match(markup, /class="flex flex-wrap items-end gap-4" data-testid="collection-records-primary-filters"/);
  assert.match(markup, />Filter</);
  assert.match(markup, />Reset</);
  const searchInputMarkup = markup.match(/<input\b[^>]*\bid="collection-records-search"[^>]*>/)?.[0];
  assert.ok(searchInputMarkup);
  assert.match(searchInputMarkup, /type="search"/);
  assert.match(searchInputMarkup, /value="00009007199254740993"/);
  assert.match(searchInputMarkup, /placeholder="Cari nama \/ IC \/ akaun \/ Card No \/ batch \/ telefon \/ jumlah bayaran"/);
  assert.doesNotMatch(searchInputMarkup, /(?:maxLength|inputMode)="/i);
  assert.doesNotMatch(markup, /<select[^>]*collection-records-nickname-filter/);
});

test("CollectionRecordsFilters gives search more room and keeps desktop actions together", () => {
  const markup = renderFilters();

  assert.match(markup, /class="min-w-0 flex-\[1_1_10rem\] space-y-2"><label[^>]*for="collection-records-from-date-button"/);
  assert.match(markup, /class="min-w-0 flex-\[1_1_10rem\] space-y-2"><label[^>]*for="collection-records-to-date-button"/);
  assert.match(markup, /class="min-w-0 flex-\[2_1_18rem\] space-y-2"><label[^>]*for="collection-records-search"/);
  assert.match(markup, /class="min-w-0 flex-\[1_1_12rem\] \[&amp;&gt;div\]:space-y-2"/);
  const actions = markup.match(/<div\b[^>]*data-testid="collection-records-filter-actions"[^>]*>(.*?)<\/div>/)?.[1];
  assert.ok(actions);
  assert.equal((actions.match(/<button\b/g) ?? []).length, 2);
  assert.match(actions, />Filter<\/button>.*>Reset<\/button>/);
  assert.doesNotMatch(actions, /disabled=/);
  assert.match(markup, /repeat\(auto-fit,minmax\(min\(100%,160px\),1fr\)\)/);
  assert.doesNotMatch(markup, /<details\b/);
});

test("CollectionRecordsFilters preserves permission gates and disabled actions in the grouped layout", () => {
  const markup = renderFilters({
    canUseNicknameFilter: false,
    canUseTeamLeaderFilter: false,
    loadingRecords: true,
  });

  assert.doesNotMatch(markup, /id="collection-records-nickname-filter"/);
  assert.doesNotMatch(markup, /id="collection-records-leader-desktop"/);
  assert.match(markup, /id="collection-records-source-desktop"/);
  assert.match(markup, /id="collection-records-aging-desktop"/);
  assert.match(markup, /id="collection-records-classification-desktop"/);
  assert.match(markup, /id="collection-records-sort-desktop"/);
  const actions = markup.match(/<div\b[^>]*data-testid="collection-records-filter-actions"[^>]*>(.*?)<\/div>/)?.[1];
  assert.ok(actions);
  assert.equal((actions.match(/disabled=""/g) ?? []).length, 2);
  const fieldOrder = [
    "collection-records-from-date-button",
    "collection-records-to-date-button",
    "collection-records-search",
    "collection-records-filter-actions",
  ].map((id) => markup.indexOf(id));
  assert.ok(fieldOrder.every((position, index) => position >= 0 && (index === 0 || position > fieldOrder[index - 1])));
});
