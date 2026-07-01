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
    /return \(\) => \{\s*mountedRef\.current = false;\s*exportAbortControllerRef\.current\?\.abort\(\);\s*exportAbortControllerRef\.current = null;\s*exportInFlightRef\.current = null;\s*\};/s,
  );
  assert.match(
    source,
    /const resetExportState = useCallback\(\(\) => \{\s*exportInFlightRef\.current = null;\s*if \(mountedRef\.current\) \{\s*setExportingExcel\(false\);\s*setExportingPdf\(false\);/s,
  );
  assert.match(
    source,
    /const cancelActiveExport = useCallback\(\(\) => \{\s*exportAbortControllerRef\.current\?\.abort\(\);\s*exportAbortControllerRef\.current = null;\s*resetExportState\(\);/s,
  );
});

test("viewer export finalizers only close the matching active export", () => {
  assert.match(
    source,
    /const finishPdfExport = useCallback\(\(\) => \{\s*if \(exportInFlightRef\.current === "pdf"\) \{\s*exportInFlightRef\.current = null;\s*if \(mountedRef\.current\) \{\s*setExportingPdf\(false\);/s,
  );
  assert.match(
    source,
    /const finishExcelExport = useCallback\(\(\) => \{\s*if \(exportInFlightRef\.current === "excel"\) \{\s*exportInFlightRef\.current = null;\s*if \(mountedRef\.current\) \{\s*setExportingExcel\(false\);/s,
  );
  assert.doesNotMatch(source, /const finishPdfExport = useCallback\(\(\) => \{\s*exportInFlightRef\.current = null;\s*setExportingPdf\(false\);/s);
  assert.doesNotMatch(source, /const finishExcelExport = useCallback\(\(\) => \{\s*exportInFlightRef\.current = null;\s*setExportingExcel\(false\);/s);
});
