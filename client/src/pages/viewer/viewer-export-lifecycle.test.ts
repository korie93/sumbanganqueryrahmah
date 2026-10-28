import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./useViewerExportState.ts", import.meta.url),
  "utf8",
);

test("viewer export state cancels and resets active exports", () => {
  assert.match(source, /const mountedRef = useRef\(true\);/);
  assert.match(
    source,
    /return \(\) => \{\s*mountedRef\.current = false;\s*lifecycle\.cancel\(\);\s*\};/s,
  );
  assert.match(
    source,
    /const cancelActiveExport = useCallback\(\(\) => \{\s*lifecycle\.cancel\(\);\s*if \(mountedRef\.current\) setExportProgress\(null\);/s,
  );
  assert.match(
    source,
    /useEffect\(\(\) => cancelActiveExport, \[cancelActiveExport, importId, debouncedSearch, debouncedColumnFilters\]\);/,
  );
});

test("viewer export finalizers only close the matching active export", () => {
  assert.match(
    source,
    /beforeRun: \(\) => \{\s*if \(canExport && !canExport\(\)\) return false;\s*owner = lifecycle\.start\(kind\);\s*if \(!owner\) return false;/s,
  );
  assert.match(
    source,
    /afterRun: \(\) => \{\s*if \(owner && lifecycle\.finish\(owner\) && mountedRef\.current\) setExportProgress\(null\);/s,
  );
  assert.match(
    source,
    /const shouldContinue = \(\) => mountedRef\.current && owner !== null && lifecycle\.isCurrent\(owner\)\s*&& \(!canExport \|\| canExport\(\)\);/,
  );
});
