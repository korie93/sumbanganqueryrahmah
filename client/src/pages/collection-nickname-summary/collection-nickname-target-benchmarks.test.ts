import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionNicknameTargetMonthWeights,
  calculateCollectionNicknameWeightedTarget,
  getCollectionNicknameTargetBenchmark,
  normalizeCollectionNicknameTargetKey,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";

test("buildCollectionNicknameTargetMonthWeights prorates a single selected month", () => {
  const weights = buildCollectionNicknameTargetMonthWeights("2026-06-16", "2026-06-30");

  assert.deepEqual(weights, [
    {
      daysInMonth: 30,
      month: "2026-06",
      overlapDays: 15,
      weight: 0.5,
    },
  ]);
  assert.equal(calculateCollectionNicknameWeightedTarget(60_000, weights[0].weight), 30_000);
});

test("buildCollectionNicknameTargetMonthWeights supports cross-month ranges", () => {
  const weights = buildCollectionNicknameTargetMonthWeights("2026-05-30", "2026-06-02");

  assert.equal(weights.length, 2);
  assert.deepEqual(weights[0], {
    daysInMonth: 31,
    month: "2026-05",
    overlapDays: 2,
    weight: 2 / 31,
  });
  assert.deepEqual(weights[1], {
    daysInMonth: 30,
    month: "2026-06",
    overlapDays: 2,
    weight: 2 / 30,
  });
});

test("target benchmark helpers normalize nickname keys and return safe fallback", () => {
  const benchmarks = new Map<string, CollectionNicknameTargetBenchmark>([
    [
      normalizeCollectionNicknameTargetKey(" Collector   Alpha "),
      {
        amount: 50_000,
        configuredMonths: 1,
        missingMonths: 0,
        requestedMonths: 1,
      },
    ],
  ]);

  assert.equal(getCollectionNicknameTargetBenchmark(benchmarks, "collector alpha").amount, 50_000);
  assert.equal(getCollectionNicknameTargetBenchmark(benchmarks, "Unknown").amount, 0);
  assert.deepEqual(buildCollectionNicknameTargetMonthWeights("bad", "2026-06-01"), []);
});
