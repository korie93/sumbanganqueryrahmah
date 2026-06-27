import assert from "node:assert/strict";
import test from "node:test";
import {
  addCollectionNicknameConfiguredMonthlyTarget,
  buildCollectionNicknameTargetBenchmarksFromRows,
  buildCollectionNicknameTargetMonths,
  getCollectionNicknameTargetBenchmark,
  normalizeCollectionNicknameTargetKey,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";

test("buildCollectionNicknameTargetMonths keeps the configured target for a partial month", () => {
  const months = buildCollectionNicknameTargetMonths("2026-06-16", "2026-06-30");

  assert.deepEqual(months, [{ month: "2026-06" }]);
  assert.equal(addCollectionNicknameConfiguredMonthlyTarget(0, 60_000), 60_000);
});

test("buildCollectionNicknameTargetMonths sums full configured targets across months", () => {
  const months = buildCollectionNicknameTargetMonths("2026-05-30", "2026-06-02");

  assert.deepEqual(months, [{ month: "2026-05" }, { month: "2026-06" }]);
  assert.equal(
    addCollectionNicknameConfiguredMonthlyTarget(
      addCollectionNicknameConfiguredMonthlyTarget(0, 31_000),
      30_000,
    ),
    61_000,
  );
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
  assert.deepEqual(buildCollectionNicknameTargetMonths("bad", "2026-06-01"), []);
});

test("buildCollectionNicknameTargetBenchmarksFromRows reuses backend summary targets", () => {
  const benchmarks = buildCollectionNicknameTargetBenchmarksFromRows([
    {
      nickname: "Collector Alpha",
      totalAmount: 70_000,
      totalRecords: 10,
      targetBenchmark: {
        amount: 80_000.125,
        configuredMonths: 1,
        missingMonths: 0,
        requestedMonths: 1,
      },
    },
    {
      nickname: "Collector Beta",
      totalAmount: 5_000,
      totalRecords: 2,
      targetBenchmark: {
        amount: -1,
        configuredMonths: "bad" as unknown as number,
        missingMonths: 1,
        requestedMonths: 1,
      },
    },
    {
      nickname: "Collector Gamma",
      totalAmount: 0,
      totalRecords: 0,
      targetBenchmark: null,
    },
  ]);

  assert.equal(getCollectionNicknameTargetBenchmark(benchmarks, "collector alpha").amount, 80_000.13);
  assert.equal(getCollectionNicknameTargetBenchmark(benchmarks, "collector alpha").configuredMonths, 1);
  assert.equal(getCollectionNicknameTargetBenchmark(benchmarks, "collector beta").amount, 0);
  assert.equal(getCollectionNicknameTargetBenchmark(benchmarks, "collector beta").missingMonths, 1);
  assert.equal(getCollectionNicknameTargetBenchmark(benchmarks, "collector gamma").requestedMonths, 0);
});
