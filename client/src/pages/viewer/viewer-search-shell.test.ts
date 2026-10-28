import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewerContentDatasetSection } from "./ViewerContentDatasetSection";
import { ViewerContentFiltersSection } from "./ViewerContentFiltersSection";
import { ViewerEmptyState } from "./ViewerEmptyState";
import { ViewerSearchBar } from "./ViewerSearchBar";
import { ViewerSearchSummary } from "./ViewerSearchSummary";
import { ViewerContentErrorBanner } from "./ViewerContentErrorBanner";

const noop = () => undefined;
const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const fixture: ComponentProps<typeof ViewerContentDatasetSection> = {
  toolbarActions: createElement("button", { type: "button" }, "Filters"),
  filterPanel: createElement("div", { "data-testid": "synthetic-filter-panel" }, "Column filters"),
  allHeaders: ["Name", "Account"],
  loading: false,
  error: "",
  canRetry: false,
  retrying: false,
  onRetry: noop,
  emptyHint: "",
  isSearchBelowMinLength: false,
  onBackToSaved: noop,
  rows: [],
  filteredRows: [],
  visibleHeaders: ["Name"],
  search: "unmatched",
  showResultsSummary: true,
  activeFilters: [{ id: "search", label: "Search: unmatched", onRemove: noop }],
  searchInputRef: createRef<HTMLInputElement>(),
  minSearchLength: 2,
  debouncedSearch: "unmatched",
  enableVirtualRows: false,
  gridTemplateColumns: "44px 64px 240px",
  tableDensity: "comfortable",
  rowHeightPx: 48,
  selectedRowIds: new Set(),
  selectAllFiltered: false,
  virtualTableMinWidth: 900,
  viewportHeightPx: 520,
  totalRows: 0,
  currentPage: 1,
  totalPages: 1,
  pageStart: 0,
  pageEnd: 0,
  hasPageFilterSubset: false,
  hasNextPage: false,
  hasPreviousPage: false,
  loadingMore: false,
  rowsPerPage: 25,
  pageSizeDisabled: false,
  onRowsPerPageChange: noop,
  onClearAllFilters: noop,
  onSearchChange: noop,
  onToggleRowSelection: noop,
  onToggleSelectAllFiltered: noop,
  onClearSelection: noop,
  onPrevPage: noop,
  onNextPage: noop,
};

test("Viewer retry keeps a separate error alert and a disabled busy control with a working return", () => {
  for (const [canRetry, retrying, disabled] of [[true, false, false], [false, false, true], [true, true, true]] as const) {
    const markup = renderToStaticMarkup(createElement(ViewerContentErrorBanner, {
      error: "Synthetic temporary failure", canRetry, retrying, onRetry: noop, onBackToSaved: noop,
    }));
    assert.match(markup, /role="alert">Synthetic temporary failure<\/p>/);
    const retry = markup.match(/<button[^>]*data-testid="button-retry-viewer"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    assert.match(retry, retrying ? /Memuat semula…/ : /Cuba Semula/);
    assert.equal(/disabled=""/.test(retry), disabled);
    assert.doesNotMatch(retry, /role="alert"/);
    const back = markup.match(/<button[^>]*>Back to Saved Imports<\/button>/)?.[0] ?? "";
    assert.ok(back);
    assert.doesNotMatch(back, /\sdisabled(?:=|[\s>])/);
  }
});

test("Viewer search, refinement chips and actions remain available in every non-table state", () => {
  const states = [
    { overrides: {}, expected: "Tiada hasil carian" },
    { overrides: { search: "u", isSearchBelowMinLength: true }, expected: "Teruskan menaip untuk carian" },
    { overrides: { loading: true }, expected: "Mencari rekod..." },
    { overrides: { error: "Could not load this file" }, expected: "Could not load this file" },
  ];
  for (const { overrides, expected } of states) {
    const markup = renderToStaticMarkup(createElement(ViewerContentDatasetSection, { ...fixture, ...overrides }));
    assert.match(markup, /aria-label="Dataset records"/);
    assert.equal((markup.match(/id="viewer-search-query"/g) ?? []).length, 1);
    assert.match(markup, /data-testid="input-search-viewer"/);
    assert.match(markup, />Filters<\/button>/);
    assert.match(markup, /data-testid="synthetic-filter-panel"/);
    assert.match(markup, /Remove filter Search: unmatched/);
    assert.match(markup, /Clear all/);
    assert.ok(markup.includes(expected));
    assert.ok(markup.indexOf("viewer-search-query") < markup.indexOf('class="viewer-results'));
    assert.doesNotMatch(markup, /<h[1-6]|Dataset rows|Search and inspect the dataset/);
  }
});

test("Viewer empty state differentiates no dataset, short search and no matches", () => {
  const render = (props: Partial<ComponentProps<typeof ViewerEmptyState>>) => renderToStaticMarkup(
    createElement(ViewerEmptyState, { emptyHint: "Open a file from Saved Imports.", minSearchLength: 2, isSearchBelowMinLength: false, ...props }),
  );
  const noDataset = render({});
  assert.match(noDataset, />Tiada data<\/p>/);
  assert.match(noDataset, /Open a file from Saved Imports\./);
  assert.doesNotMatch(noDataset, /Kosongkan carian dan filter/);
  const noMatches = render({ hasActiveRefinement: true, onClearRefinements: noop });
  assert.match(noMatches, /Tiada hasil carian/);
  assert.match(noMatches, /Cuba kata kunci lain atau kosongkan carian dan filter\./);
  assert.match(noMatches, /Kosongkan carian dan filter/);
  assert.doesNotMatch(noMatches, /Open a file from Saved Imports/);
  // The global dark theme elevates .ops-empty-state with !important. Keep this
  // flat Viewer result independent so it does not regain a boxed background.
  assert.match(noMatches, /class="viewer-empty-state"/);
  assert.doesNotMatch(noMatches, /ops-empty-state/);
  assert.match(source("ViewerPage.css"), /\.viewer-page-frame \.viewer-empty-state\s*\{[^}]*background:\s*transparent;/);
  const shortSearch = render({ hasActiveRefinement: true, isSearchBelowMinLength: true, onClearRefinements: noop });
  assert.match(shortSearch, /Teruskan menaip untuk carian/);
  assert.match(shortSearch, /Masukkan sekurang-kurangnya 2 aksara/);
  assert.doesNotMatch(shortSearch, /Tiada hasil carian/);
});

test("Viewer result status remains polite, atomic and separate from busy results", () => {
  const markup = renderToStaticMarkup(createElement(ViewerContentDatasetSection, { ...fixture, loading: true }));
  const status = markup.match(/<p[^>]*role="status"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
  assert.match(status, /aria-live="polite"/);
  assert.match(status, /aria-atomic="true"/);
  assert.match(status, /Mencari rekod/);
  assert.ok(markup.indexOf(status) < markup.indexOf('aria-busy="true"'));
  const idleStatus = renderToStaticMarkup(createElement(ViewerSearchSummary, { filteredRowsCount: 24, rowsCount: 24, totalRows: 90, visible: false }));
  assert.match(idleStatus, /class="sr-only"/);
  assert.match(idleStatus, /90 hasil · 24 dipaparkan/);
  const fallbackStatus = renderToStaticMarkup(createElement(ViewerSearchSummary, { filteredRowsCount: 24, rowsCount: 24 }));
  assert.match(fallbackStatus, /24 shown on this page of 24/);
});

test("Viewer result status announces refinement requests while keeping loaded results mounted", () => {
  const rows = [{ __rowId: 0, Name: "Synthetic Customer", Account: "00001234" }];
  const markup = renderToStaticMarkup(createElement(ViewerContentDatasetSection, {
    ...fixture,
    rows,
    filteredRows: rows,
    totalRows: rows.length,
    loading: false,
    loadingMore: true,
  }));
  const status = markup.match(/<p[^>]*role="status"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
  assert.match(status, /Mencari rekod\.\.\./);
  assert.doesNotMatch(status, /1 hasil/);
  assert.ok(markup.indexOf(status) < markup.indexOf('aria-busy="true"'));
  assert.match(markup, /data-testid="input-search-viewer"/);
  // Only initial loading swaps out results for the loading skeleton. Refinement
  // requests preserve the current table until their replacement response arrives.
  assert.match(source("ViewerContentDatasetSection.tsx"), /loading=\{loading \|\| loadingMore\}/);
  assert.match(source("ViewerContentDatasetSection.tsx"), /\) : loading \? \(\s*<ViewerDataTableFallback/);
});

test("Viewer search preserves exact input labels, escapes values and exposes focused recovery", () => {
  const markup = renderToStaticMarkup(createElement(ViewerSearchBar, {
    search: '<img src=x onerror="alert(1)">',
    filteredRowsCount: 0,
    rowsCount: 0,
    showResultsSummary: true,
    activeFilters: [],
    searchInputRef: createRef<HTMLInputElement>(),
    onClearAllFilters: noop,
    onSearchChange: noop,
  }));
  assert.match(markup, /<label for="viewer-search-query"[^>]*>Search all rows<\/label>/);
  assert.match(markup, /placeholder="Cari semua rekod\.\.\."/);
  assert.match(markup, /aria-label="Clear search"/);
  assert.match(markup, /value="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;"/);
  assert.doesNotMatch(markup, /<img/);
  assert.match(source("ViewerSearchBar.tsx"), /onSearchChange\(""\);\s+searchInputRef\?\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source("ViewerContentDatasetSection.tsx"), /onClearAllFilters\(\);\s+searchInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});

test("Viewer column filter panel depends on authorized headers, not current result count", () => {
  const props = {
    filterTriggerRef: createRef<HTMLButtonElement>(),
    isMobile: false,
    showFilters: true,
    headers: ["Name"],
    columnFilters: [],
    onAddFilter: noop,
    onClearAllFilters: noop,
    onUpdateFilter: noop,
    onRemoveFilter: noop,
    onShowFiltersChange: noop,
  };
  const knownHeaders = renderToStaticMarkup(createElement(ViewerContentFiltersSection, props));
  assert.notEqual(knownHeaders, "");
  const noHeaders = renderToStaticMarkup(createElement(ViewerContentFiltersSection, { ...props, headers: [] }));
  assert.equal(noHeaders, "");
  const content = source("ViewerContent.tsx");
  assert.equal((content.match(/<ViewerContentDatasetSection\b/g) ?? []).length, 1);
  assert.match(content, /allHeaders=\{headers\}/);
  assert.doesNotMatch(content, /hasRows|ViewerContentSummaryStrip|ViewerLoadingSkeleton/);
});
