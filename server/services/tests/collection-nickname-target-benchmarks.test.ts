import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionNicknameTargetBenchmarkMap,
  normalizeCollectionNicknameTargetBenchmarkKey,
} from "../collection/collection-nickname-target-benchmarks";
import type { CollectionStoragePort } from "../collection/collection-service-support";

test("nickname target benchmarks use full configured monthly targets across partial ranges", async () => {
  const calls: Array<{ username: string; year: number; month: number }> = [];
  const storage = {
    getCollectionDailyTarget: async (params: { username: string; year: number; month: number }) => {
      calls.push(params);
      const monthlyTarget = params.month === 5 ? 31_000 : params.month === 6 ? 30_000 : null;
      return monthlyTarget === null
        ? undefined
        : {
            id: `target-${params.month}`,
            ...params,
            monthlyTarget,
            createdBy: "superuser",
            updatedBy: "superuser",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          };
    },
  } as unknown as CollectionStoragePort;

  const benchmarks = await buildCollectionNicknameTargetBenchmarkMap(storage, {
    from: "2026-05-30",
    to: "2026-06-02",
    nicknames: ["Collector Alpha"],
  });

  assert.deepEqual(calls, [
    { username: "Collector Alpha", year: 2026, month: 5 },
    { username: "Collector Alpha", year: 2026, month: 6 },
  ]);
  assert.deepEqual(
    benchmarks.get(normalizeCollectionNicknameTargetBenchmarkKey("Collector Alpha")),
    {
      amount: 61_000,
      configuredMonths: 2,
      missingMonths: 0,
      requestedMonths: 2,
    },
  );
});

test("nickname target benchmarks preserve configured zero targets", async () => {
  const storage = {
    getCollectionDailyTarget: async (params: { username: string; year: number; month: number }) => ({
      id: "target-zero",
      ...params,
      monthlyTarget: 0,
      createdBy: "superuser",
      updatedBy: "superuser",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  } as unknown as CollectionStoragePort;

  const benchmarks = await buildCollectionNicknameTargetBenchmarkMap(storage, {
    from: "2026-06-16",
    to: "2026-06-30",
    nicknames: ["Collector Alpha"],
  });

  assert.deepEqual(
    benchmarks.get(normalizeCollectionNicknameTargetBenchmarkKey("Collector Alpha")),
    {
      amount: 0,
      configuredMonths: 1,
      missingMonths: 0,
      requestedMonths: 1,
    },
  );
});
