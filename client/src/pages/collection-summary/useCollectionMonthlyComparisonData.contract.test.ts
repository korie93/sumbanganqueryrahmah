import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(
    process.cwd(),
    "client",
    "src",
    "pages",
    "collection-summary",
    "useCollectionMonthlyComparisonData.ts",
  ),
  "utf8",
);

const targetSource = readFileSync(
  path.resolve(
    process.cwd(),
    "client",
    "src",
    "pages",
    "collection-summary",
    "useCollectionMonthlyComparisonTarget.ts",
  ),
  "utf8",
);

test("useCollectionMonthlyComparisonData aborts in-flight requests on cleanup and request replacement", () => {
  assert.match(source, /const abortControllerRef = useRef<AbortController \| null>\(null\)/);
  assert.match(source, /abortControllerRef\.current\.abort\(\)/);
  assert.match(source, /return \(\) => \{\s*isMountedRef\.current = false;\s*abortRequest\(\);\s*\};/s);
  assert.match(source, /const eventListenerController = new AbortController\(\);/);
  assert.match(source, /window\.addEventListener\(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged, \{\s*signal: eventListenerController\.signal,\s*\}\);/s);
  assert.match(source, /eventListenerController\.abort\(\)/);
  assert.doesNotMatch(source, /window\.removeEventListener\(COLLECTION_DATA_CHANGED_EVENT/);
});

test("useCollectionMonthlyComparisonTarget reads configured target safely without stale fallback", () => {
  assert.match(targetSource, /getCollectionMonthlyTarget/);
  assert.match(targetSource, /parseCollectionMonthKey\(targetMonth\)/);
  assert.match(targetSource, /months:\s*data\?\.months\.map/);
  assert.match(targetSource, /month,\s*nickname:\s*targetRequest\.nickname/s);
  assert.match(targetSource, /nickname:\s*targetRequest\.nickname/);
  assert.match(targetSource, /setTargetsByMonth\(nextTargetsByMonth\)/);
  assert.match(targetSource, /setMonthlyTargetAmount\(null\);\s*setTargetsByMonth\(\{\}\);\s*setLoading\(true\);/s);
  assert.match(targetSource, /normalizeCollectionMonthlyComparisonTargetAmount\(response\.monthlyTarget\)/);
  assert.doesNotMatch(targetSource, /window\.addEventListener\(COLLECTION_DATA_CHANGED_EVENT/);
  assert.doesNotMatch(targetSource, /getCollectionDailyOverview/);
});
