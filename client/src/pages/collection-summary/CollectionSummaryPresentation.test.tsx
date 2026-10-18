import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionSummaryTable } from "./CollectionSummaryTable";
import { CollectionSummaryTotals } from "./CollectionSummaryTotals";
import { CollectionSummaryFilters } from "./CollectionSummaryFilters";

test("collection summary presents every month in a named table with unchanged totals and drill-down", () => {
  const summaryRows = [
    { month: 8, monthName: "August", totalRecords: 0, totalAmount: 0 },
    { month: 9, monthName: "September", totalRecords: 59, totalAmount: 144 },
  ];
  const markup = renderToStaticMarkup(createElement(CollectionSummaryTable, {
    loading: false, summaryRows, selectedMonth: 9, onSelectMonth: () => undefined,
  }));
  assert.match(markup, /<table[^>]*aria-label="Monthly collection totals"/);
  for (const heading of ["Month", "Records", "Total (RM)"]) assert.ok(markup.includes(heading));
  assert.equal((markup.match(/aria-haspopup="dialog"/g) || []).length, 2);
  assert.equal((markup.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(markup, />August</);
  assert.match(markup, />September</);
  assert.match(markup, />59</);
  assert.match(markup, /RM(?:&nbsp;|\u00a0| )144\.00/);
  assert.match(markup, /RM(?:&nbsp;|\u00a0| )0\.00/);
  assert.doesNotMatch(markup, /rounded-2xl|xl:grid-cols-3/);
  const source = readFileSync(new URL("./CollectionSummaryTable.tsx", import.meta.url), "utf8");
  assert.match(source, /onClick=\{\(\) => onSelectMonth\(row\.month\)\}/);
});

test("collection summary loading uses a labelled table-sized skeleton", () => {
  const markup = renderToStaticMarkup(createElement(CollectionSummaryTable, {
    loading: true, summaryRows: [], selectedMonth: null, onSelectMonth: () => undefined,
  }));
  assert.match(markup, /role="status" aria-label="Loading collection summary"/);
  assert.match(markup, /Loading summary/);
  assert.doesNotMatch(markup, /<button/);
});

test("collection summary softly marks the current month and aligns numeric totals", () => {
  const markup = renderToStaticMarkup(createElement(CollectionSummaryTable, {
    loading: false,
    summaryRows: [{ month: 9, monthName: "September", totalRecords: 59, totalAmount: 144 }],
    selectedMonth: null, currentMonth: 9, onSelectMonth: () => undefined,
  }));
  assert.match(markup, /bg-primary\/5/);
  assert.equal((markup.match(/>Current month<\/span>/g) || []).length, 1);
  assert.match(markup, /text-right tabular-nums[^>]*>59/);
  assert.match(markup, /text-right font-medium tabular-nums/);
});

test("collection summary totals retain amounts in two compact columns", () => {
  const markup = renderToStaticMarkup(createElement(CollectionSummaryTotals, {
    grandTotal: { totalRecords: 59, totalAmount: 144 },
  }));
  assert.match(markup, /grid-cols-2/);
  assert.match(markup, /Grand Total Records/);
  assert.match(markup, /Grand Total Amount/);
  assert.match(markup, /RM(?:&nbsp;|\u00a0| )144\.00/);
});

test("collection summary year control retains its field and user nickname filtering restriction", () => {
  const noop = () => undefined;
  const markup = renderToStaticMarkup(createElement(CollectionSummaryFilters, {
    canFilterByNickname: false, selectedYear: "2026", yearOptions: [2025, 2026], nicknameDropdownOpen: false,
    loading: false, visibleNicknameOptions: [], selectedNicknameSet: new Set<string>(), selectedNicknameLabel: "All",
    allSelected: false, partiallySelected: false, selectedNicknamesCount: 0,
    onSelectedYearChange: noop, onNicknameDropdownOpenChange: noop, onToggleNickname: noop,
    onSelectAllVisible: noop, onClearAllSelected: noop,
  }));
  assert.match(markup, /for="collection-summary-year-filter"/);
  assert.match(markup, /id="collection-summary-year-filter"/);
  assert.match(markup, /<option value="2026" selected="">2026/);
  assert.match(markup, /focus-visible:ring-2/);
  assert.doesNotMatch(markup, /Staff Nickname|collection-summary-nickname-filter/);
});

test("summary removes duplicate heading and restores mobile filter focus", () => {
  const source = readFileSync(new URL("../collection/CollectionSummaryPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<h1|OperationalSectionCard|rounded-\[1\.5rem\]/);
  assert.match(source, /<h2 id="collection-summary-heading"/);
  assert.ok(source.indexOf("<CollectionSummaryTotals") < source.indexOf("<CollectionSummaryTable"));
  assert.match(source, /ref=\{mobileFiltersTriggerRef\}/);
  assert.match(source, /onCloseAutoFocus=\{\(event\) => \{/);
  assert.match(source, /mobileFiltersTriggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});

test("monthly comparison shows the ledger before closed secondary diagnostics and retains target details", () => {
  const panel = readFileSync(new URL("./CollectionMonthlyComparisonPanel.tsx", import.meta.url), "utf8");
  const setup = readFileSync(new URL("./CollectionMonthlyComparisonSetupCard.tsx", import.meta.url), "utf8");
  const ledgerPosition = panel.indexOf("<CollectionMonthlyComparisonLedger");
  assert.ok(ledgerPosition >= 0, "The primary visual ledger is present");
  for (const [testId, components] of [
    ["collection-monthly-same-day-analysis", ["<CollectionSameDayPaceSection", "{sameDayPaceChartSlot}"]],
    ["collection-monthly-detailed-analysis", ["<CollectionMonthlyComparisonBreakdownSection", "chartSlot={chartSlot}", "<CollectionMonthlyComparisonInsightsSection"]],
  ] as const) {
    const disclosure = panel.match(new RegExp(`<details\\b[^>]*data-testid="${testId}"[^>]*>[\\s\\S]*?<\\/details>`))?.[0];
    assert.ok(disclosure, `Native disclosure ${testId} is present`);
    assert.ok(ledgerPosition < panel.indexOf(disclosure), "The ledger precedes secondary diagnostics");
    const openingTag = disclosure.slice(0, disclosure.indexOf(">") + 1);
    assert.doesNotMatch(openingTag, /\bopen(?:=|\s|>)/, "Secondary diagnostics remain closed by default");
    for (const component of components) {
      assert.ok(disclosure.includes(component), `${component} stays mounted inside ${testId}`);
    }
    assert.ok(disclosure.indexOf(components[0]) < disclosure.indexOf(components[components.length - 1]!),
      "The primary analysis precedes its supplementary content");
  }
  const targetDetails = setup.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(targetDetails, "Target details remain available");
  assert.doesNotMatch(targetDetails.slice(0, targetDetails.indexOf(">") + 1), /\bopen(?:=|\s|>)/);
  assert.match(targetDetails, /<summary[^>]*aria-label=\{`Monthly target details: \$\{targetDisplayLabel\}`\}>\s*Target details\s*<\/summary>/);
  assert.match(targetDetails, /<CollectionComparisonTargetCards/);
  assert.match(setup, /onClick=\{onPrintReport\}/);
  assert.match(setup, /onClick=\{onExportCsv\}/);
  assert.match(setup, /disabled=\{loading \|\| monthlyTargetLoading \|\| !data\}/);
  assert.ok(setup.indexOf("Target unavailable:") > setup.indexOf("</details>"), "Target failures remain visible outside collapsed details");
  assert.match(panel, /<details[^>]*data-testid="collection-monthly-same-day-analysis"/);
  assert.match(panel, /<summary>Same-day pace analysis<\/summary>/);
  assert.match(panel, /<details[^>]*data-testid="collection-monthly-detailed-analysis"/);
  assert.match(panel, /<summary>Benchmarks, projections and data quality<\/summary>/);
  const css = readFileSync(new URL("./CollectionMonthlyComparisonPanel.css", import.meta.url), "utf8");
  assert.match(css, /@media print[\s\S]*details::details-content[\s\S]*content-visibility: visible/);
  assert.match(css, /details > :not\(summary\)[\s\S]*display: block !important/);
});
