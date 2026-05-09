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
    "useCollectionMonthlySameDayPace.ts",
  ),
  "utf8",
);

test("useCollectionMonthlySameDayPace keeps daily comparison loading abortable and synchronized", () => {
  assert.match(source, /getCollectionDailyOverview/);
  assert.match(source, /buildCollectionSameDayPaceComparison/);
  assert.match(source, /formatCollectionMonthInput\(referenceDate\)/);
  assert.match(source, /shiftCollectionMonthInput\(currentMonthKey, -1\)/);
  assert.match(source, /comparison\?\.targetMonth/);
  assert.match(source, /comparison\?\.baseMonth/);
  assert.match(source, /dayRange/);
  assert.match(source, /resolveCollectionMonthlyComparisonTargetForMonth/);
  assert.match(source, /Promise\.all\(/);
  assert.match(source, /currentOverview\.summary\.monthlyTarget/);
  assert.match(source, /previousOverview\.summary\.monthlyTarget/);
  assert.match(source, /abortControllerRef\.current\.abort\(\)/);
  assert.match(source, /window\.addEventListener\(COLLECTION_DATA_CHANGED_EVENT/);
  assert.match(source, /window\.removeEventListener\(COLLECTION_DATA_CHANGED_EVENT/);
});
