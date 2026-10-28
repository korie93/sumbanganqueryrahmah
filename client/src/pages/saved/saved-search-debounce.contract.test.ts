import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("Saved text requests debounce with cleanup and publish the latest complete pair", () => {
  const query = read("./useSavedSearchQuery.ts");
  assert.match(query, /SAVED_SEARCH_DEBOUNCE_MS = 300/);
  assert.match(query, /window\.clearTimeout\(timerRef\.current\)/);
  assert.match(query, /return cancelTimer;\s*\}, \[cancelTimer, composing, flush, submitted, text\]\)/);
  assert.match(query, /submittedRef\.current = textRef\.current;\s*setSubmitted\(textRef\.current\)/);
  assert.match(query, /if \(!value\.trim\(\)\) flush\(\)/);
  assert.match(query, /if \(composingRef\.current\.searchTerm \|\| composingRef\.current\.uploaderFilter\) return false/);
  assert.doesNotMatch(query, /localStorage|sessionStorage|setInterval|useDeferredValue/);
});

test("Saved keeps raw ownership while flush avoids reading a stale submitted closure", () => {
  const data = read("./useSavedDataState.ts");
  const page = read("./useSavedImportPage.ts");
  const state = read("./useSavedPageState.ts");
  assert.match(data, /page, pageSize, searchTerm, uploaderFilter, activeCreatedOn/);
  assert.match(data, /contextKey, queryReady: query\.queryReady/);
  assert.match(data, /search: query\.submitted\.searchTerm, createdBy: query\.submitted\.uploaderFilter/);
  assert.match(data, /if \(flush\(\)\) void data\.refresh\(\)/);
  assert.match(page, /!queryReady \|\| !currentQueryRef\.current\.ready/);
  assert.match(state, /data\.loading && !data\.searchPending/);
  assert.match(state, /refreshDisabled \|\| data\.searchPending/);
});

test("Saved keyboard submit respects composition and is wired for both text inputs", () => {
  const controls = read("./SavedFiltersBar.tsx");
  const page = read("../Saved.tsx");
  assert.match(controls, /event\.nativeEvent\.isComposing/);
  assert.match(controls, /event\.nativeEvent\.keyCode/);
  assert.match(controls, /event\.preventDefault\(\)/);
  assert.equal((controls.match(/onKeyDown=\{handleSearchKeyDown\}/g) ?? []).length, 2);
  assert.match(page, /onSubmitSearch=\{state\.submitSearch\}/);
  assert.match(page, /onSearchCompositionChange=\{state\.setSearchComposing\}/);
  assert.match(page, /onUploaderCompositionChange=\{state\.setUploaderComposing\}/);
});
