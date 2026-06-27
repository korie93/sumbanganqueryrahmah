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
      latestUpdatedAt: "2026-01-01T00:00:00.000Z",
      latestUpdatedBy: "superuser",
      missingMonths: 0,
      months: [
        {
          amount: 31_000,
          configured: true,
          month: "2026-05",
          updatedAt: "2026-01-01T00:00:00.000Z",
          updatedBy: "superuser",
        },
        {
          amount: 30_000,
          configured: true,
          month: "2026-06",
          updatedAt: "2026-01-01T00:00:00.000Z",
          updatedBy: "superuser",
        },
      ],
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
      latestUpdatedAt: "2026-01-01T00:00:00.000Z",
      latestUpdatedBy: "superuser",
      missingMonths: 0,
      months: [{
        amount: 0,
        configured: true,
        month: "2026-06",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "superuser",
      }],
      requestedMonths: 1,
    },
  );
});

test("nickname target benchmarks expose missing months and the latest safe audit metadata", async () => {
  const storage = {
    getCollectionDailyTarget: async (params: { username: string; year: number; month: number }) => {
      if (params.month === 7) {
        return null;
      }
      return {
        id: `target-${params.month}`,
        ...params,
        monthlyTarget: 50_000,
        createdBy: "superuser",
        updatedBy: " manager.one ",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-20T01:02:03.000Z"),
      };
    },
  } as unknown as CollectionStoragePort;

  const benchmarks = await buildCollectionNicknameTargetBenchmarkMap(storage, {
    from: "2026-06-01",
    to: "2026-07-31",
    nicknames: ["Collector Alpha"],
  });
  const benchmark = benchmarks.get(
    normalizeCollectionNicknameTargetBenchmarkKey("Collector Alpha"),
  );

  assert.equal(benchmark?.amount, 50_000);
  assert.equal(benchmark?.configuredMonths, 1);
  assert.equal(benchmark?.missingMonths, 1);
  assert.equal(benchmark?.latestUpdatedBy, "manager.one");
  assert.equal(benchmark?.latestUpdatedAt, "2026-06-20T01:02:03.000Z");
  assert.deepEqual(benchmark?.months[1], {
    amount: 0,
    configured: false,
    month: "2026-07",
    updatedAt: null,
    updatedBy: null,
  });
});
