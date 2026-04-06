import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCategoryStatsSummary,
  detectCategoryCountRequest,
  normalizeCategoryStatsKeys,
} from "../category-stats-query-utils";
import { DEFAULT_COUNT_GROUPS } from "../category-stats-types";

test("detectCategoryCountRequest returns null without count trigger", () => {
  const result = detectCategoryCountRequest("senarai pekerja kerajaan", DEFAULT_COUNT_GROUPS);
  assert.equal(result, null);
});

test("detectCategoryCountRequest returns matched enabled rules", () => {
  const rules = [
    ...DEFAULT_COUNT_GROUPS,
    {
      key: "disabled",
      terms: ["disabled"],
      fields: ["EmployerName"],
      enabled: false,
    },
  ];

  const result = detectCategoryCountRequest("berapa ramai pekerja polis dan tentera", rules);
  assert.deepEqual(
    result?.map((rule) => rule.key),
    ["polis", "tentera"],
  );
});

test("normalizeCategoryStatsKeys removes blanks, deduplicates, and sorts", () => {
  const result = normalizeCategoryStatsKeys(["tentera", "", "__all__", "tentera", "polis"]);
  assert.deepEqual(result, ["__all__", "polis", "tentera"]);
});

test("buildCategoryStatsSummary includes totals and samples", () => {
  const statsMap = new Map([
    [
      "polis",
      {
        key: "polis",
        total: 3,
        samples: [
          { name: "Ali", ic: "900101011234", source: "import-a" },
          { name: "Abu", ic: "900101011235", source: null },
        ],
        updatedAt: new Date(),
      },
    ],
  ]);

  const result = buildCategoryStatsSummary(
    DEFAULT_COUNT_GROUPS.filter((group) => group.key === "polis"),
    statsMap,
    12,
  );

  assert.match(result, /Jumlah rekod dianalisis: 12/);
  assert.match(result, /- polis: 3/);
  assert.match(result, /Ali \| IC: 900101011234 \(import-a\)/);
  assert.match(result, /Abu \| IC: 900101011235/);
});
