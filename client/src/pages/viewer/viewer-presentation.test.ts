import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewerDataFieldCard } from "./ViewerDataFieldCard";
import { ViewerFooterActions } from "./ViewerFooterActions";
import { ViewerMobileCard } from "./ViewerMobileCard";
import { ViewerMoreActions } from "./ViewerMoreActions";
import { ViewerPageHeader } from "./ViewerPageHeader";
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

test("mobile rows retain selection and preview fields while deferring closed overflow values", () => {
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
  assert.doesNotMatch(extraFields, /<dl|<dt|<dd|001122334455|Additional record information/);
  assert.doesNotMatch(extraFields, /00009007199254740993/);
  assert.match(markup, /00001234567890123456/);
  const lists = [...markup.matchAll(/<dl\b[^>]*>([\s\S]*?)<\/dl>/g)];
  assert.equal(lists.length, 1);
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
      rowsPerPage: 25,
      pageSizeDisabled: loadingMore,
      onRowsPerPageChange: noop,
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

test("pagination exposes a labelled native page-size control and retains custom desktop values", () => {
  const render = (size: number, busy: boolean) => renderToStaticMarkup(createElement(ViewerFooterActions, {
    currentPage: 1, totalPages: 3, selectedRowCount: 0, hasPreviousPage: false, hasNextPage: true,
    loadingMore: busy, rowsPerPage: size, pageSizeDisabled: busy, onRowsPerPageChange: noop,
    onClearSelection: noop, onPrevPage: noop, onNextPage: noop,
  }));
  const markup = render(200, false);
  assert.match(markup, /<label[^>]*for="viewer-page-size"[^>]*>Rows per page<\/label>/);
  assert.match(markup, /<select[^>]*id="viewer-page-size"[^>]*name="viewerPageSize"/);
  assert.match(markup, /<option value="200" selected="">200<\/option>/);
  for (const size of [25, 50, 100]) assert.match(markup, new RegExp(`<option value="${size}">${size}</option>`));
  assert.doesNotMatch(markup.match(/<select[^>]*>/)?.[0] ?? "", / disabled=/);
  assert.match(render(25, true).match(/<select[^>]*>/)?.[0] ?? "", /disabled=""/);
});

test("Viewer footer stays in document flow and mobile toolbar reserves a compact More action", () => {
  const footer = source("ViewerFooter.tsx");
  const footerCss = source("ViewerFooter.module.css");
  assert.match(footer, /<nav\s+aria-label="Dataset pagination"/);
  assert.match(footer, /aria-label="Dataset pagination"/);
  assert.doesNotMatch(footer, /sticky|fixed|shadow-lg|backdrop/);
  assert.match(footerCss, /safe-area-inset-bottom/);
  assert.doesNotMatch(footerCss, /^\s*(?:position|bottom)\s*:/m);
  assert.match(source("ViewerPage.css"), /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) 2\.75rem/);
  assert.match(source("ViewerPage.css"), /\.viewer-more-label\s*\{\s*display:\s*none/);
});

test("compact Viewer header has one escaped dataset heading, a Saved action and concise counts", () => {
  const markup = renderToStaticMarkup(createElement(ViewerPageHeader, {
    importName: "DEMO Dataset <script>unsafe</script>",
    totalRows: 1234,
    headersCount: 10,
    loading: false,
    onBack: noop,
  }));
  assert.equal((markup.match(/<h1\b/g) ?? []).length, 1);
  assert.match(markup, /<h1[^>]*id="viewer-dataset-title"/);
  assert.match(markup, /DEMO Dataset &lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script\b/);
  assert.doesNotMatch(markup.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? "", /<button\b/);
  const backButton = markup.match(/<button\b[^>]*data-testid="button-back"[^>]*>/)?.[0] ?? "";
  assert.match(backButton, /type="button"/);
  assert.match(backButton, /aria-label="Go back"/);
  assert.match(markup, />Saved<\/button>/);
  assert.match(markup, /1,234 rekod · 10 lajur/);
  assert.doesNotMatch(markup, /ready for inspection|Dataset rows|<h2\b/);
});

test("compact Viewer header distinguishes loading from a genuinely empty dataset", () => {
  const props = { importName: "DEMO Dataset", totalRows: 0, headersCount: 0, onBack: noop };
  const loading = renderToStaticMarkup(createElement(ViewerPageHeader, { ...props, loading: true }));
  assert.match(loading, /Memuatkan rekod…/);
  assert.doesNotMatch(loading, /0 rekod|0 lajur/);
  const empty = renderToStaticMarkup(createElement(ViewerPageHeader, { ...props, loading: false }));
  assert.match(empty, /0 rekod/);
  assert.doesNotMatch(empty, /Memuatkan rekod|0 lajur/);
});

test("Viewer controls keep recovery actions for zero results but hide them without dataset headers", () => {
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
  assert.match(superuser, /button-viewer-more-actions/);
  assert.doesNotMatch(superuser, /button-export-menu/, "Export lives inside the closed More menu, not a duplicated toolbar control");
  const empty = renderToStaticMarkup(createElement(ViewerPageHeaderActions, { ...props, rowsCount: 0, isSuperuser: true }));
  assert.match(empty, /button-toggle-filters/);
  assert.match(empty, /button-viewer-more-actions/);
  assert.doesNotMatch(empty, /button-export-menu/);
  const noDataset = renderToStaticMarkup(createElement(ViewerPageHeaderActions, {
    ...props, rowsCount: 0, headers: [], isSuperuser: true,
  }));
  assert.doesNotMatch(noDataset, /button-export-menu|button-toggle-filters|button-viewer-more-actions|viewer-density-control/);
});

test("Viewer More actions keep exports superuser-and-data gated with busy and subset protections", () => {
  const props = {
    isSuperuser: false,
    exportBusy: false,
    rowsCount: 1,
    totalRows: 1,
    filteredRowsCount: 1,
    selectedRowCount: 0,
    hasFilteredSubset: false,
    onClearAllData: noop,
    onExportCsv: noop,
    onExportPdf: noop,
    onExportExcel: noop,
  };
  for (const state of [props, { ...props, isSuperuser: true }, { ...props, isSuperuser: true, rowsCount: 0 }]) {
    const markup = renderToStaticMarkup(createElement(ViewerMoreActions, state));
    assert.match(markup, /data-testid="button-viewer-more-actions"/);
    assert.match(markup, /aria-label="More dataset actions"/);
    assert.match(markup, /aria-haspopup="menu"/);
    assert.match(markup, /aria-expanded="false"/);
  }
  // Radix deliberately omits closed portal content during SSR. Inspect the
  // explicit condition as well as rendering the real accessible launcher.
  const moreSource = source("ViewerMoreActions.tsx");
  const exportSection = moreSource.match(/\{isSuperuser && rowsCount > 0 \? \(([\s\S]*?)\) : null\}/)?.[1];
  assert.ok(exportSection, "Export submenu must remain inside both the superuser and loaded-row guards");
  assert.match(exportSection, /<DropdownMenuSubTrigger disabled=\{exportBusy\} data-testid="button-export-menu"/);
  assert.match(exportSection, /disabled=\{exportBusy \|\| option\.disabled\}/);
  assert.match(exportSection, /option\.kind === "csv" \? onExportCsv/);
  assert.match(exportSection, /option\.kind === "pdf" \? onExportPdf : onExportExcel/);
  assert.match(exportSection, /runExport\(option\.exportFiltered, option\.exportSelected\)/);
  assert.match(moreSource, /buildViewerExportMenuSections\(\{\s*exportBusy, totalRows, filteredRowsCount, selectedRowCount, hasFilteredSubset/);
  assert.match(moreSource, /onSelect=\{onClearAllData\}\s+data-testid="button-clear-all"/);
  assert.doesNotMatch(source("ViewerPageHeaderActions.tsx"), /<ViewerExportMenu\b/);
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
