import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedPageHeader } from "./SavedPageHeader";
import { SavedRefreshNotice } from "./SavedRefreshNotice";
import { SavedWorkspacePanel } from "./SavedWorkspacePanel";

const noop = () => undefined;
const headerProps = {
  loading: false,
  hasPage: true,
  totalImports: 1,
  filtered: false,
  selectedCount: 0,
  actionsDisabled: false,
  refreshDisabled: false,
  refreshRef: createRef<HTMLButtonElement>(),
  onRefresh: noop,
  onBulkDelete: noop,
};

function headerMarkup(overrides: Partial<typeof headerProps> = {}) {
  return renderToStaticMarkup(createElement(SavedPageHeader, { ...headerProps, ...overrides }));
}

function readSavedSource(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("Saved compact header has one title and a truthful singular or plural file count", () => {
  const singular = headerMarkup();
  assert.equal((singular.match(/<h1\b/g) || []).length, 1);
  assert.match(singular, /<h1[^>]*>Saved Imports<\/h1>/);
  assert.match(singular, />1 file</);
  assert.match(singular, /data-testid="button-refresh"/);
  assert.doesNotMatch(singular, /Imported Data|operational datasets|of 1/);
  assert.match(headerMarkup({ totalImports: 0 }), />0 files</);
  assert.match(headerMarkup({ totalImports: 42 }), />42 files</);
});

test("Saved filtered count identifies matching files rather than a global total", () => {
  for (const totalImports of [0, 1, 1234]) {
    const markup = headerMarkup({ totalImports, filtered: true });
    assert.ok(markup.includes(`>${totalImports.toLocaleString()} matching<`));
    assert.doesNotMatch(markup, / on page| of |\bfiles</);
  }
});

test("Saved initial loading and failed headers wait for a confirmed page before showing a count", () => {
  for (const loading of [true, false]) {
    const markup = headerMarkup({ hasPage: false, loading, refreshDisabled: loading });
    assert.doesNotMatch(markup, /data-testid="text-import-count"/);
    assert.match(markup, /<h1[^>]*>Saved Imports<\/h1>/);
    assert.match(markup, /data-testid="button-refresh"/);
  }
  const loading = headerMarkup({ loading: true, hasPage: false, refreshDisabled: true });
  assert.match(loading, /motion-safe:animate-spin/);
  assert.match(loading, /<button[^>]*disabled=""[^>]*data-testid="button-refresh"/);
  assert.match(headerMarkup(), /data-testid="text-import-count"/);
});

test("Saved refresh retains the last confirmed count and separates retry from destructive actions", () => {
  const refreshing = headerMarkup({ loading: true, actionsDisabled: true, refreshDisabled: true });
  assert.match(refreshing, />1 file</);
  assert.match(refreshing, /<button[^>]*disabled=""[^>]*data-testid="button-refresh"/);
  const stale = headerMarkup({ selectedCount: 2, actionsDisabled: true, refreshDisabled: false });
  assert.match(stale, />1 file</);
  assert.match(stale, /<button[^>]*disabled=""[^>]*data-testid="button-bulk-delete"/);
  assert.match(stale, /<button[^>]*data-testid="button-refresh"/);
  assert.doesNotMatch(stale, /<button[^>]*disabled=""[^>]*data-testid="button-refresh"/);
});

test("Saved retained-page notices provide one live message and a responsive retry action", () => {
  const renderNotice = (refreshing: boolean, isStale: boolean, refreshDisabled: boolean) =>
    renderToStaticMarkup(createElement(SavedRefreshNotice, {
      refreshing, isStale, refreshDisabled, onRefresh: noop,
    }));
  assert.equal(renderNotice(false, false, false), "");
  const refreshing = renderNotice(true, false, true);
  assert.match(refreshing, /Mengemas kini senarai…/);
  assert.match(refreshing, /Paparan terakhir dikekalkan sementara senarai dimuat semula\./);
  assert.match(refreshing, /<button[^>]*disabled=""[^>]*data-testid="button-retry-saved"/);
  const stale = renderNotice(false, true, false);
  assert.match(stale, /Senarai belum dapat dikemas kini\./);
  assert.match(stale, /Paparan terakhir ditunjukkan\. Muat semula sebelum membuat perubahan\./);
  assert.match(stale, />Cuba Semula</);
  assert.doesNotMatch(stale, /<button[^>]*disabled=""/);
  for (const markup of [refreshing, stale]) {
    assert.equal((markup.match(/role="status"/g) || []).length, 1);
    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(markup, /data-saved-ai-avoid="true"/);
    assert.match(markup, /flex-col[^"<]*sm:flex-row/);
    assert.match(markup, /w-full shrink-0 sm:w-auto/);
    assert.doesNotMatch(markup, /role="alert"|animate-|<svg/);
  }
});

test("Saved destructive header actions appear only for selected files and honor disabled state", async () => {
  assert.doesNotMatch(headerMarkup(), /button-bulk-delete|Delete Selected/);
  const selected = headerMarkup({ selectedCount: 3, actionsDisabled: true });
  assert.match(selected, /Delete Selected \(3\)/);
  assert.match(selected, /<button[^>]*disabled=""[^>]*data-testid="button-bulk-delete"/);
  const page = await readSavedSource("../Saved.tsx");
  assert.match(page, /selectedCount=\{state\.isSuperuser \? state\.selectedImportIds\.size : 0\}/);
  assert.match(page, /SavedSourceConfigProvider enabled=\{state\.isSuperuser\}/);
});

test("Saved search and categories are mounted before the stateful result branch", async () => {
  const page = await readSavedSource("../Saved.tsx");
  const controls = page.match(/<section\b[^>]*aria-label="Search and Filter"[^>]*>([\s\S]*?)<\/section>/)?.[0];
  assert.ok(controls, "Saved must retain its named search and filter region");
  assert.match(page, /<SavedPageHeader[\s\S]*?\/>\s*<section\b[^>]*aria-label="Search and Filter"/);
  assert.ok(page.indexOf(controls) < page.indexOf("<SavedSourceConfigProvider"));
  assert.equal((controls.match(/<SavedFiltersBar\b/g) || []).length, 1);
  assert.equal((controls.match(/<SavedWorkspacePanel\b/g) || []).length, 1);
  assert.doesNotMatch(controls, /state\.totalImports\s*(?:>|===)|state\.loading\s*&&|key=/);
  assert.match(controls, /searchInputRef=\{state\.searchInputRef\}/);
  assert.match(controls, /summary=\{state\.hasPage \? state\.workspaceSummary : undefined\}/);
  assert.match(controls, /role="status" aria-atomic="true"/);
  assert.match(controls, /!state\.hasPage \|\| state\.loading \|\| state\.isStale \|\| state\.error\s*\? ""/);
});

test("Saved errors suppress misleading empty results while preserving recovery controls", async () => {
  const page = await readSavedSource("../Saved.tsx");
  assert.match(page, /<span role="alert">\{state\.error\}<\/span>/);
  assert.match(page, /\{state\.error && !state\.hasPage \? \(/);
  assert.match(page, /\{state\.error && !state\.hasPage \? null : state\.loading && !state\.hasPage \? \(/);
  assert.match(page, /!state\.hasActiveFilters && state\.workspaceView === "all" && state\.totalImports === 0/);
  assert.match(page, /state\.loadedImportCount === 0 && state\.hasActiveFilters/);
  assert.match(page, /onClick=\{state\.clearFilters\}[\s\S]*?data-testid="button-clear-filters-empty"/);
  assert.match(page, /<SavedRefreshNotice\s+refreshing=\{state\.refreshing\}\s+isStale=\{state\.isStale\}\s+refreshDisabled=\{state\.refreshDisabled\}\s+onRefresh=\{state\.handleRefresh\}/);
  assert.match(page, /<SavedPageHeader[\s\S]*?hasPage=\{state\.hasPage\}[\s\S]*?refreshDisabled=\{state\.refreshDisabled\}/);
});

test("Saved empty categories retain navigation and a Show All recovery path", async () => {
  const markup = renderToStaticMarkup(createElement(SavedWorkspacePanel, {
    activeView: "duplicates", onViewChange: noop,
  }));
  for (const view of ["all", "recent", "large", "duplicates", "review"]) {
    assert.match(markup, new RegExp(`<option[^>]*value="${view}"`));
  }
  assert.match(markup, /<select[^>]*aria-label="Saved workspace views"/);
  assert.match(markup, /<option[^>]*value="duplicates"[^>]*selected=""/);
  assert.doesNotMatch(markup, /Loaded page totals|On this page:/);
  const workspace = await readSavedSource("./SavedImportsWorkspace.tsx");
  assert.match(workspace, /const hasNoWorkspaceResults = imports\.length === 0;/);
  assert.match(workspace, /onClick=\{\(\) => onWorkspaceViewChange\("all"\)\}/);
  assert.match(workspace, /data-testid="button-show-all-saved"/);
  assert.doesNotMatch(workspace, /<SavedWorkspacePanel\b/);
});

test("Saved keyboard search shortcut remains available during result loading", async () => {
  const state = await readSavedSource("./useSavedPageState.ts");
  const shortcut = state.match(/usePageShortcuts\(\[([\s\S]*?)\]\);/)?.[1];
  assert.ok(shortcut);
  assert.match(shortcut, /key: "\/"/);
  assert.match(shortcut, /searchInputRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(shortcut, /enabled:\s*!data\.loading/);
  assert.match(state, /visibleImports\.length\.toLocaleString\(\)\} on this page/);
});
