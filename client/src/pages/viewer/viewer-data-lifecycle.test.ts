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
    /const isActiveViewerFetchRequest = useCallback\(\(\s*controller: AbortController,\s*requestId: number,\s*\) => \(\s*mountedRef\.current\s*&& !controller\.signal\.aborted\s*&& fetchAbortControllerRef\.current === controller\s*&& requestId === activeRequestIdRef\.current\s*\), \[\]\);/s,
  );
  assert.match(
    source,
    /const response = await getImportData\([\s\S]*?\);\s*if \(!isActiveViewerFetchRequest\(controller, requestId\)\) \{\s*return;\s*\}/s,
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
