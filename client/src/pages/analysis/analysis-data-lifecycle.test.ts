import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./useAnalysisDataState.ts", import.meta.url),
  "utf8",
);

test("analysis data state ignores aborted or superseded analysis responses", () => {
  assert.match(source, /analysisAbortControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /analysisRequestIdRef\.current \+= 1/);
  assert.match(
    source,
    /const isActiveAnalysisRequest = useCallback\(\(\s*controller: AbortController,\s*requestId: number,\s*\) => \(\s*!controller\.signal\.aborted\s*&& analysisAbortControllerRef\.current === controller\s*&& requestId === analysisRequestIdRef\.current\s*\), \[\]\);/s,
  );
  assert.match(
    source,
    /const data = await analyzeAll\(\{ signal: controller\.signal \}\);\s*if \(!isActiveAnalysisRequest\(controller, requestId\)\) \{\s*return;\s*\}/s,
  );
  assert.match(
    source,
    /const data = await analyzeImport\(importId, \{ signal: controller\.signal \}\);\s*if \(!isActiveAnalysisRequest\(controller, requestId\)\) \{\s*return;\s*\}/s,
  );
  assert.match(
    source,
    /if \(isActiveAnalysisRequest\(controller, requestId\)\) \{\s*setLoading\(false\);\s*\}\s*if \(analysisAbortControllerRef\.current === controller\) \{\s*analysisAbortControllerRef\.current = null;/s,
  );
});
