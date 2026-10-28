import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./useViewerDataState.ts", import.meta.url),
  "utf8",
);

test("viewer data fetches only update state for the active request", () => {
  assert.match(source, /fetchAbortControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /activeRequestIdRef\.current \+= 1/);
  assert.match(
    source,
    /const isActiveViewerFetchRequest = useCallback\(\(\s*controller: AbortController,\s*requestId: number,\s*\) => \(\s*mountedRef\.current\s*&& !controller\.signal\.aborted\s*&& fetchAbortControllerRef\.current === controller\s*&& requestId === activeRequestIdRef\.current\s*&& activeRequestContextRef\.current === currentQueryRef\.current\.key\s*&& currentQueryRef\.current\.ready\s*\), \[\]\);/s,
  );
  assert.match(
    source,
    /const response = await withReadDeadline\(\(signal\) => getImportData\([\s\S]*?\}\), controller\.signal\);\s*if \(!isActiveViewerFetchRequest\(controller, requestId\)\) \{\s*return;\s*\}/s,
  );
  assert.match(
    source,
    /catch \(fetchError\) \{\s*if \(!isActiveViewerFetchRequest\(controller, requestId\)\) \{\s*return;\s*\}/s,
  );
  assert.match(
    source,
    /const shouldFinalizeRequest = isActiveViewerFetchRequest\(controller, requestId\);\s*if \(fetchAbortControllerRef\.current === controller\) \{\s*fetchAbortControllerRef\.current = null;\s*\}\s*if \(shouldFinalizeRequest\) \{\s*setLoading\(false\);\s*setLoadingMore\(false\);/s,
  );
});

test("Viewer retries the failed target and cursor only within the same ready query", () => {
  assert.match(source, /columnFilters: debouncedColumnFilters\.map\(\(filter\) => \(\{ \.\.\.filter \}\)\)/);
  assert.match(source, /const failed = isViewerRetryableError\(fetchError\) \? read : null/);
  assert.match(source, /!failed \|\| fetchAbortControllerRef\.current\s*\|\| !currentQueryRef\.current\.ready \|\| failed\.key !== currentQueryRef\.current\.key/);
  assert.match(source, /fetchData\(failed\.importId, \{ page: failed\.page, cursor: failed\.cursor, retryRequest: failed \}\)/);
  assert.match(source, /if \(!options\?\.retryRequest\) setError\(""\)/);
  const fetchEffect = source.slice(source.indexOf("setNextCursor(null);"), source.indexOf("const handlePrevPage"));
  assert.doesNotMatch(fetchEffect, /failedRequest|retrying/);
});

test("failed reads and pending raw queries cannot start an export of old rows", () => {
  assert.match(source, /setRows\(\[\]\);\s*setTotalRows\(0\);\s*loadedQueryKeyRef\.current = null/);
  assert.match(source, /const canExport = useCallback\(\(\) => mountedRef\.current && currentQueryRef\.current\.ready\s*&& loadedQueryKeyRef\.current === currentQueryRef\.current\.key\s*&& !fetchAbortControllerRef\.current && !failedRequestRef\.current/);
  const page = readFileSync(new URL("../Viewer.tsx", import.meta.url), "utf8");
  const state = readFileSync(new URL("./useViewerPageState.ts", import.meta.url), "utf8");
  const exports = readFileSync(new URL("./useViewerExportState.ts", import.meta.url), "utf8");
  assert.match(page, /rowsCount=\{viewer\.exportReady \? viewer\.rows\.length : 0\}/);
  assert.match(state, /canExport: data\.canExport/);
  assert.match(exports, /!mountedRef\.current \|\| \(canExport && !canExport\(\)\)/);
  const renderer = readFileSync(new URL("../../app/AppPageRenderer.tsx", import.meta.url), "utf8");
  assert.match(renderer, /<ViewerPage\s+key=\{JSON\.stringify\(\[user\.id \?\? user\.username, user\.role\]\)\}/);
});
