import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedImportCard } from "./SavedImportCard";
import { SavedImportsList } from "./SavedImportsList";
import { SavedWorkspacePanel } from "./SavedWorkspacePanel";
import { SavedFiltersBar } from "./SavedFiltersBar";
import { SavedLoadingSkeleton } from "./SavedLoadingSkeleton";
import type { ImportItem } from "./types";

const item: ImportItem = {
  id: "00009007199254740993", name: "September & collections", filename: "file-000001.xlsx",
  createdAt: "2026-09-23T01:00:00.000Z", rowCount: 1200, sourceSizeBytes: 2048,
};
const noop = () => undefined;
const rowProps = {
  actionsDisabled: false, density: "comfortable" as const, duplicateHashCounts: new Map<string, number>(),
  formatDate: () => "23/09/2026, 9:00 AM", isActive: false, isSelected: false, isSuperuser: false, item,
  onAnalysis: noop, onDelete: noop, onInspect: noop, onRename: noop, onToggleSelected: noop, onView: noop,
};

test("Saved table rows retain exact identifiers and metadata with one primary action and one menu", () => {
  const markup = renderToStaticMarkup(createElement(SavedImportCard, rowProps));
  assert.match(markup, /^<tr[^>]*role="row"/);
  assert.match(markup, /data-testid="card-import-00009007199254740993"/);
  assert.match(markup, /September &amp; collections/);
  assert.match(markup, /file-000001\.xlsx/);
  assert.match(markup, /23\/09\/2026, 9:00 AM/);
  assert.match(markup, /1,200 rows/);
  assert.match(markup, /2\.0 KB/);
  assert.match(markup, />Ready</);
  assert.match(markup, /data-testid="button-view-00009007199254740993"/);
  assert.match(markup, /data-testid="button-import-actions-00009007199254740993"/);
  assert.doesNotMatch(markup, /role="checkbox"|Collection source|button-rename-|button-delete-/);
});

test("Saved row selection and mobile layout preserve the superuser boundary and density", () => {
  const markup = renderToStaticMarkup(createElement(SavedImportCard, {
    ...rowProps, isSuperuser: true, isActive: true, isSelected: true, actionsDisabled: true, density: "compact",
  }));
  assert.match(markup, /aria-selected="true"/);
  assert.match(markup, /data-density="compact"/);
  assert.match(markup, /aria-checked="true"[^>]*disabled=""/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /Collection source:/);
  assert.match(markup, /md:table-row/);
  assert.match(markup, /overflow-wrap:anywhere/);
});

test("Saved rows only omit a redundant filename while keeping distinct filenames", () => {
  const markup = renderToStaticMarkup(createElement(SavedImportCard, {
    ...rowProps, item: { ...item, name: "same-file.xlsx", filename: "same-file.xlsx" },
  }));
  assert.equal((markup.match(/>same-file\.xlsx</g) || []).length, 1);
  assert.match(markup, /file same-file\.xlsx/);
});

test("Saved imports use a named semantic table and role-gated source column", () => {
  const props = {
    ...rowProps, activeImportId: null, allVisibleSelected: false, filesOpen: true, imports: [item],
    partiallySelected: false, selectedImportIds: new Set<string>(), summaryLabel: "1 on this page · 1 matching",
    onFilesOpenChange: noop, onToggleSelectAllVisible: noop,
  };
  const markup = renderToStaticMarkup(createElement(SavedImportsList, props));
  assert.match(markup, /<table[^>]*aria-label="Saved imports"/);
  assert.match(markup, /<thead/);
  assert.match(markup, /<tbody/);
  assert.match(markup, /scope="col"[^>]*>Imported \/ size</);
  assert.match(markup, /scope="col"[^>]*>Actions</);
  assert.doesNotMatch(markup, /Collection source|Select all visible imports/);
  const privileged = renderToStaticMarkup(createElement(SavedImportsList, { ...props, isSuperuser: true }));
  assert.match(privileged, /scope="col"[^>]*>Collection source</);
  assert.match(privileged, /Select all visible imports/);
});

test("Saved workspace categories wrap without a second rail and retain all summary values", () => {
  const markup = renderToStaticMarkup(createElement(SavedWorkspacePanel, {
    activeView: "review", onViewChange: noop,
    summary: { loadedFiles: 9, totalFiles: 60, loadedRows: 12345, loadedSizeBytes: 2048,
      recentCount: 3, largeCount: 2, duplicateCount: 1, reviewCount: 1, hasPartialLoad: true },
  }));
  for (const view of ["all", "recent", "large", "duplicates", "review"]) {
    assert.match(markup, new RegExp(`data-testid="button-saved-view-${view}"`));
  }
  assert.equal((markup.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(markup, /flex-wrap/);
  assert.match(markup, /9 on page · 60 matching/);
  assert.match(markup, /12,345/);
  assert.match(markup, /2\.0 KB/);
  assert.doesNotMatch(markup, /<aside|grid-cols-1/);
});

test("Saved filter search has an accessible label and retains advanced filters", () => {
  const markup = renderToStaticMarkup(createElement(SavedFiltersBar, {
    searchTerm: "", uploaderFilter: "staff", minRowsFilter: "0", maxRowsFilter: "5000", hasActiveFilters: true,
    onSearchTermChange: noop, onUploaderFilterChange: noop, onDateFilterChange: noop,
    onMinRowsFilterChange: noop, onMaxRowsFilterChange: noop, onClearFilters: noop,
  }));
  assert.match(markup, /aria-label="Search saved imports by name, filename, or uploader"/);
  for (const control of ["input-search-saved", "button-date-filter", "input-saved-uploader", "input-saved-min-rows", "input-saved-max-rows"]) {
    assert.match(markup, new RegExp(`data-testid="${control}"`));
  }
  assert.match(markup, /aria-expanded="true"/);
});

test("compact source status still launches existing configuration and preserves detailed index information", () => {
  const control = readFileSync(new URL("./SavedSourceConfigCardControl.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("./SavedSourceConfigDialog.tsx", import.meta.url), "utf8");
  assert.match(control, /if \(!sourceState\.enabled\) return null/);
  assert.match(control, /if \(compact\)/);
  assert.match(control, /onClick=\{\(\) => sourceState\.openConfig\(item\)\}/);
  assert.match(control, /disabled=\{disabled \|\| sourceState\.loading \|\| sourceState\.mutationPending\}/);
  assert.match(control, /aria-haspopup="dialog"/);
  assert.match(dialog, /getSavedSourceCompatibilityMessage\(config\)/);
  assert.match(dialog, /config\.indexedRowCount\.toLocaleString\(\)/);
  assert.match(dialog, /config\.rowCount\.toLocaleString\(\)/);
});

test("Saved loading state mirrors table rows without nested card chrome", () => {
  const markup = renderToStaticMarkup(createElement(SavedLoadingSkeleton));
  assert.match(markup, /role="status" aria-label="Loading saved imports"/);
  assert.equal((markup.match(/rounded-xl/g) || []).length, 1);
  assert.doesNotMatch(markup, /shadow-sm/);
});
