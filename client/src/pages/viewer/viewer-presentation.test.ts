import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewerDataFieldCard } from "./ViewerDataFieldCard";
import { ViewerFooterActions } from "./ViewerFooterActions";
import { ViewerMobileCard } from "./ViewerMobileCard";
import { ViewerPageHeaderActions } from "./ViewerPageHeaderActions";
import { ViewerFiltersPanel } from "./ViewerFiltersPanel";
import type { DataRowWithId } from "./types";

const noop = () => undefined;
const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("viewer mobile fields preserve identifier strings, escaping and definition semantics", () => {
  const markup = renderToStaticMarkup(createElement(ViewerDataFieldCard, {
    header: "Card Number",
    value: "00009007199254740993<script>bad</script>",
  }));
  assert.match(markup, /<dt[^>]*>Card Number<\/dt>/);
  assert.match(markup, /<dd[^>]*>00009007199254740993&lt;script&gt;bad&lt;\/script&gt;<\/dd>/);
  assert.doesNotMatch(markup, /<script/);
  assert.doesNotMatch(markup, /rounded-xl|bg-muted/);
  assert.doesNotMatch(markup, /role="group"|aria-label=/, "A dl child wrapper stays a neutral div so dt/dd retain list semantics");
});

test("mobile rows retain selection, four preview fields and all overflow values", () => {
  const row: DataRowWithId = {
    __rowId: 70,
    Account: "00001234567890123456",
    Name: "Synthetic Example",
    Card: "00009007199254740993",
    Amount: "5000.00",
    IC: "001122334455",
    Note: "Additional record information",
  };
  const markup = renderToStaticMarkup(createElement(ViewerMobileCard, {
    row,
    selected: true,
    visibleHeaders: ["Account", "Name", "Card", "Amount", "IC", "Note"],
    onToggleRowSelection: noop,
  }));
  assert.match(markup, /aria-label="Select row 71"/);
  assert.match(markup, /aria-checked="true"/);
  assert.match(markup, /border-primary bg-primary\/5/);
  assert.match(markup, /<details[^>]*>/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(markup, /Show 2 more fields/);
  const extraFields = markup.slice(markup.indexOf("<details"));
  assert.match(extraFields, /001122334455/);
  assert.match(extraFields, /Additional record information/);
  assert.doesNotMatch(extraFields, /00009007199254740993/);
  assert.match(markup, /00001234567890123456/);
  const lists = [...markup.matchAll(/<dl\b[^>]*>([\s\S]*?)<\/dl>/g)];
  assert.equal(lists.length, 2);
  for (const list of lists) {
    assert.doesNotMatch(list[1]!, /role="group"|aria-label=/);
    assert.equal((list[1]!.match(/<dt\b/g) ?? []).length, (list[1]!.match(/<dd\b/g) ?? []).length);
  }
});

test("compact pagination preserves disabled states, loading and selected-row action", () => {
  const render = (loadingMore: boolean, selectedRowCount: number) => renderToStaticMarkup(
    createElement(ViewerFooterActions, {
      currentPage: 2,
      totalPages: 3,
      selectedRowCount,
      hasPreviousPage: false,
      hasNextPage: true,
      loadingMore,
      onClearSelection: noop,
      onPrevPage: noop,
      onNextPage: noop,
    }),
  );
  const markup = render(false, 0);
  const previous = markup.match(/<button[^>]*data-testid="button-viewer-prev-page"[^>]*>/)?.[0];
  const next = markup.match(/<button[^>]*data-testid="button-viewer-next-page"[^>]*>/)?.[0];
  assert.ok(previous && next);
  assert.match(previous, /disabled=""/);
  assert.doesNotMatch(next, / disabled=/);
  assert.match(markup, /Page 2 of 3/);
  assert.doesNotMatch(markup, /button-clear-selection/);
  const busyMarkup = render(true, 3);
  assert.match(busyMarkup, /Loading\.\.\./);
  assert.match(busyMarkup, /button-clear-selection/);
  assert.match(busyMarkup.match(/<button[^>]*data-testid="button-viewer-next-page"[^>]*>/)?.[0] ?? "", / disabled=/);
});

test("Viewer footer stays in document flow and mobile controls occupy two columns", () => {
  const footer = source("ViewerFooter.tsx");
  const footerCss = source("ViewerFooter.module.css");
  assert.match(footer, /<nav\s+aria-label="Dataset pagination"/);
  assert.match(footer, /aria-label="Dataset pagination"/);
  assert.doesNotMatch(footer, /sticky|fixed|shadow-lg|backdrop/);
  assert.match(footerCss, /safe-area-inset-bottom/);
  assert.doesNotMatch(footerCss, /^\s*(?:position|bottom)\s*:/m);
  assert.match(source("ViewerPage.css"), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("Viewer controls keep export superuser-only and hide actions without rows", () => {
  const props = {
    filterTriggerRef: createRef<HTMLButtonElement>(),
    exportBusy: false,
    filteredRowsCount: 1,
    filterCount: 2,
    hasFilteredSubset: false,
    headers: ["Card"],
    densityPreference: "comfortable" as const,
    isSuperuser: false,
    onClearAllData: noop,
    onDeselectAllColumns: noop,
    onDensityChange: noop,
    onExportCsv: noop,
    onExportExcel: noop,
    onExportPdf: noop,
    onSelectAllColumns: noop,
    onShowColumnSelectorChange: noop,
    onToggleColumn: noop,
    onMoveColumn: noop,
    onResetColumns: noop,
    onToggleFilters: noop,
    rowsCount: 1,
    selectedColumns: new Set(["Card"]),
    selectedRowCount: 0,
    showColumnSelector: false,
    showFilters: true,
    totalRows: 1,
  };
  const nonSuperuser = renderToStaticMarkup(createElement(ViewerPageHeaderActions, props));
  assert.doesNotMatch(nonSuperuser, />Export</);
  assert.match(nonSuperuser, /Filters \(2\)/);
  assert.match(nonSuperuser, /aria-expanded="true"/);
  assert.match(nonSuperuser, /button-viewer-more-actions/);
  const superuser = renderToStaticMarkup(createElement(ViewerPageHeaderActions, { ...props, isSuperuser: true }));
  assert.match(superuser, />Export</);
  const empty = renderToStaticMarkup(createElement(ViewerPageHeaderActions, { ...props, rowsCount: 0, isSuperuser: true }));
  assert.doesNotMatch(empty, />Export<|button-toggle-filters|button-viewer-more-actions/);
  assert.match(source("ViewerPageHeaderActions.tsx"), /onSelect=\{onClearAllData\}/);
});

test("mobile filters restore the originating button and avoid duplicate headings", () => {
  assert.match(source("../Viewer.tsx"), /const filterTriggerRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(source("ViewerPageHeaderActions.tsx"), /ref=\{filterTriggerRef\}/);
  const filtersSection = source("ViewerContentFiltersSection.tsx");
  assert.match(filtersSection, /onCloseAutoFocus=/);
  assert.match(filtersSection, /event\.preventDefault\(\)/);
  assert.match(filtersSection, /filterTriggerRef\.current\?\.isConnected/);
  assert.match(filtersSection, /filterTriggerRef\.current\.focus\(\{ preventScroll: true \}\)/);
  const markup = renderToStaticMarkup(createElement(ViewerFiltersPanel, {
    showHeading: false,
    headers: ["Card"],
    columnFilters: [],
    onAddFilter: noop,
    onClearAllFilters: noop,
    onUpdateFilter: noop,
    onRemoveFilter: noop,
  }));
  assert.doesNotMatch(markup, /<h3/);
  assert.match(markup, /button-add-filter/);
});
