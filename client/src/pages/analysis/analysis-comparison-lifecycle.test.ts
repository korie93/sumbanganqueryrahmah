import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./useAnalysisComparisonState.ts", import.meta.url),
  "utf8",
);

test("analysis comparison aborts superseded and unmounted requests", () => {
  assert.match(source, /abortControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /return \(\) => \{\s*abortControllerRef\.current\?\.abort\(\)/s);
  assert.match(source, /requestIdRef\.current \+= 1/);
  assert.match(source, /Promise\.all\(\[/);
  assert.match(
    source,
    /const isActiveComparisonRequest = useCallback\(\(\s*controller: AbortController,\s*requestId: number,\s*\) => \(\s*!controller\.signal\.aborted\s*&& abortControllerRef\.current === controller\s*&& requestId === requestIdRef\.current\s*\), \[\]\);/s,
  );
  assert.match(source, /if \(!isActiveComparisonRequest\(controller, requestId\)\) return;/);
  assert.match(source, /!isActiveComparisonRequest\(controller, requestId\)/);
  assert.match(source, /if \(abortControllerRef\.current === controller\) \{\s*abortControllerRef\.current = null;/s);
});
