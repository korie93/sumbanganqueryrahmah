import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("useBulkImportState clears active queue work by aborting and invalidating requests", () => {
  const source = readFileSync(new URL("./useBulkImportState.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /const handleClearBulk = useCallback\(\(\) => \{\s*bulkImportRequestIdRef\.current \+= 1;\s*bulkImportAbortControllerRef\.current\?\.abort\(\);/s,
  );
  assert.match(source, /bulkImportAbortControllerRef\.current = null;/);
  assert.match(source, /bulkImportInFlightRef\.current = false;/);
  assert.match(source, /bulkProcessingRef\.current = false;/);
  assert.match(source, /setBulkProcessing\(false\);/);
});

test("useBulkImportState ignores stale queue updates after cancel or clear", () => {
  const source = readFileSync(new URL("./useBulkImportState.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /const isActiveBulkImportRequest = useCallback\(\(\s*controller: AbortController,\s*requestId: number,\s*\) => \(\s*isMountedRef\.current\s*&& !controller\.signal\.aborted\s*&& bulkImportAbortControllerRef\.current === controller\s*&& requestId === bulkImportRequestIdRef\.current\s*\), \[\]\);/s,
  );
  assert.match(
    source,
    /for \(const index of retryableIndexes\) \{\s*if \(!isActiveBulkImportRequest\(controller, requestId\)\) \{\s*break;\s*\}/s,
  );
  assert.match(
    source,
    /const importRecord = "job" in importResult[\s\S]*?: importResult;\s*if \(!isActiveBulkImportRequest\(controller, requestId\)\) \{\s*break;\s*\}/s,
  );
  assert.match(
    source,
    /catch \(bulkError: unknown\) \{\s*if \(isImportAbortError\(bulkError\) \|\| !isActiveBulkImportRequest\(controller, requestId\)\) \{\s*break;\s*\}/s,
  );
  assert.match(
    source,
    /const ownsBulkController = bulkImportAbortControllerRef\.current === controller;\s*const completedActiveRequest = isActiveBulkImportRequest\(controller, requestId\);\s*if \(ownsBulkController\) \{\s*bulkImportAbortControllerRef\.current = null;\s*bulkImportInFlightRef\.current = false;\s*bulkProcessingRef\.current = false;\s*\}/s,
  );
  assert.match(
    source,
    /if \(!completedActiveRequest\) \{\s*if \(isMountedRef\.current && ownsBulkController\) \{\s*setBulkProcessing\(false\);/s,
  );
});
