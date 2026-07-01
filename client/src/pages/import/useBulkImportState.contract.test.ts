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
