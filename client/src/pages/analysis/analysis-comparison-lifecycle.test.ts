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
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /requestId !== requestIdRef\.current/);
});
