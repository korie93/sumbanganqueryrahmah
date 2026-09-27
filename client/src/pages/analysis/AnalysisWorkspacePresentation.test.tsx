import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisFilesList } from "./AnalysisFilesList";
import { AnalysisHeader } from "./AnalysisHeader";
import { AnalysisSummarySection } from "./AnalysisSummarySection";
import { AnalysisWorkspaceNavigation } from "./AnalysisWorkspaceNavigation";
import { AnalysisDuplicatesPanel } from "./AnalysisDuplicatesPanel";
import { buildAnalysisSnapshotItems } from "./analysis-shell-utils";
import type { AllAnalysisResult } from "./types";

const allResult: AllAnalysisResult = {
  totalImports: 2,
  totalRows: 1200,
  imports: [
    { id: "file-a", name: "Accounts & Collections", filename: "accounts-000001.xlsx", rowCount: 800 },
    { id: "file-b", name: "September", filename: "september.xlsx", rowCount: 400 },
  ],
  analysis: {
    icLelaki: { count: 0, samples: [] },
    icPerempuan: { count: 0, samples: [] },
    noPolis: { count: 1, samples: ["000001"] },
    noTentera: { count: 0, samples: [] },
    passportMY: { count: 0, samples: [] },
    passportLuarNegara: { count: 0, samples: [] },
    duplicates: { count: 2, items: [{ value: "00009007199254740993", count: 2 }] },
    quality: {
      score: 98, grade: "excellent", completenessPercent: 98, typeConsistencyPercent: 98,
      profiledColumns: 1, columnsNeedingReview: 0, columnsWithMissingValues: 0,
      mixedTypeColumns: 0, limitedCardinalityColumns: 0, totalApplicableCells: 1200,
      populatedCells: 1200, emptyCells: 0, columnLimitReached: false,
    },
    columns: [],
  },
};

test("analysis navigation exposes every section once without a second rail or clipped strip", () => {
  const markup = renderToStaticMarkup(createElement(AnalysisWorkspaceNavigation, {
    activeSection: "quality", allResult, analysis: allResult.analysis, mode: "all", onSelect: () => undefined,
  }));
  assert.match(markup, /<nav[^>]*aria-label="Analysis sections"/);
  assert.match(markup, /flex-wrap/);
  assert.equal((markup.match(/aria-current="page"/g) || []).length, 1);
  for (const key of ["overview", "quality", "compare", "trends", "issues"]) {
    assert.equal((markup.match(new RegExp(`data-testid="analysis-section-${key}"`, "g")) || []).length, 1);
  }
  assert.match(markup, /98%/);
  assert.doesNotMatch(markup, /<aside|More sections|Collapse analysis sidebar/);
});

test("single-file analysis still exposes Compare and its all-file hint", () => {
  const markup = renderToStaticMarkup(createElement(AnalysisWorkspaceNavigation, {
    activeSection: "compare", allResult: null, analysis: allResult.analysis, mode: "single", onSelect: () => undefined,
  }));
  assert.match(markup, /data-testid="analysis-section-compare"/);
  assert.match(markup, />All</);
});

test("analysis header retains navigation and loading controls with compact inline scope", () => {
  const render = (mode: "all" | "single", loading: boolean) => renderToStaticMarkup(createElement(AnalysisHeader, {
    isMobile: true, mode, allResult, analysis: allResult.analysis, totalRows: 1200,
    headerDescription: "Review selected imports.", loading,
    onBackToSaved: () => undefined, onReset: () => undefined, onRefresh: () => undefined,
  }));
  const all = render("all", false);
  assert.match(all, /<h1[^>]*><span data-testid="text-analysis-title">Data Analysis/);
  assert.match(all, /2 files/);
  assert.match(all, /1,200 rows/);
  assert.match(all, /data-testid="button-back"/);
  assert.match(all, /data-testid="button-refresh"/);
  assert.doesNotMatch(all, /data-testid="button-reset"|rounded-\[28px\]/);
  const single = render("single", true);
  assert.match(single, /data-testid="button-reset"/);
  assert.match(single, /disabled=""[^>]*data-testid="button-refresh"/);
  assert.match(single, /motion-reduce:animate-none/);
});

test("analysis snapshot keeps all four metrics and supporting details without another card", () => {
  const snapshotItems = buildAnalysisSnapshotItems({
    allResult, analysis: allResult.analysis, mode: "all", singleResult: null, totalRows: 1200,
  });
  const markup = renderToStaticMarkup(createElement(AnalysisSummarySection, { snapshotItems }));
  assert.match(markup, /<section aria-labelledby="analysis-snapshot-heading"/);
  assert.match(markup, /<h2 id="analysis-snapshot-heading"/);
  for (const label of ["Scope", "Rows", "Duplicates", "Special IDs", "2 imports combined", "Repeated IDs need review"]) {
    assert.ok(markup.includes(label));
  }
  assert.match(markup, /grid-cols-2/);
  assert.doesNotMatch(markup, /ops-section-card/);
});

test("analyzed file list keeps names, filenames and row totals visible on mobile", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true, value: { innerWidth: 390, matchMedia: () => ({ matches: true }) },
  });
  try {
    const markup = renderToStaticMarkup(createElement(AnalysisFilesList, {
      allResult, filesListOpen: true,
      filesPaged: { start: 0, end: 2, items: allResult.imports, page: 0, totalPages: 1 },
      onFilesListOpenChange: () => undefined, onPageChange: () => undefined,
    }));
    assert.match(markup, /button-toggle-files-list/);
    assert.match(markup, /Accounts &amp; Collections/);
    assert.match(markup, /accounts-000001.xlsx/);
    assert.match(markup, /800 rows/);
    assert.match(markup, /divide-y divide-border/);
    assert.doesNotMatch(markup, /shadow-sm|bg-background\/75/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("duplicate panel preserves string identifiers and conditional Viewer action", () => {
  const render = (canInspect: boolean) => renderToStaticMarkup(createElement(AnalysisDuplicatesPanel, {
    count: 2, duplicates: allResult.analysis.duplicates.items, duplicatesOpen: true,
    duplicatesPaged: { start: 0, end: 1, items: allResult.analysis.duplicates.items, page: 0, totalPages: 1 },
    onCopyDuplicate: () => undefined,
    onInspectDuplicate: canInspect ? () => undefined : null,
    onDuplicatesOpenChange: () => undefined, onPageChange: () => undefined,
  }));
  assert.match(render(true), /00009007199254740993/);
  assert.match(render(true), /Find duplicate in Viewer/);
  assert.doesNotMatch(render(false), /Find duplicate in Viewer/);
  assert.match(render(false), /button-copy-dup-0/);
});
