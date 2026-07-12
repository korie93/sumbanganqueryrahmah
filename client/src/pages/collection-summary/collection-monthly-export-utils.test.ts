import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeCollectionMonthlyComparisonCsvValue,
  escapeCollectionMonthlyComparisonHtml,
  formatCollectionMonthlyComparisonReportDate,
} from "@/pages/collection-summary/collection-monthly-export-utils";

test("monthly comparison export helpers escape CSV values without changing numeric formatting", () => {
  assert.equal(escapeCollectionMonthlyComparisonCsvValue('Ali "Alpha", RM'), '"Ali ""Alpha"", RM"');
  assert.equal(escapeCollectionMonthlyComparisonCsvValue(1250.5), '"1250.5"');
  assert.equal(escapeCollectionMonthlyComparisonCsvValue(null), '""');
  assert.equal(escapeCollectionMonthlyComparisonCsvValue("=1+1"), '"\'=1+1"');
});

test("monthly comparison export helpers escape report HTML defensively", () => {
  assert.equal(
    escapeCollectionMonthlyComparisonHtml(`A&B <script>"x"</script> 'ok'`),
    "A&amp;B &lt;script&gt;&quot;x&quot;&lt;/script&gt; &#39;ok&#39;",
  );
});

test("monthly comparison export helpers keep invalid report dates blank", () => {
  assert.equal(formatCollectionMonthlyComparisonReportDate(new Date("not-a-date")), "");
  assert.match(
    formatCollectionMonthlyComparisonReportDate(new Date("2026-05-11T05:30:00.000Z")),
    /2026/,
  );
});
