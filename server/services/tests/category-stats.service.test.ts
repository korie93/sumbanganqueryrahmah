import assert from "node:assert/strict";
import test from "node:test";
import type { PostgresStorage } from "../../storage-postgres";
import { CategoryStatsService } from "../category-stats.service";
import type { CategoryRule, CategoryStatsRow } from "../category-stats-types";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

test("CategoryStatsService reuses timed-out compute work instead of queueing duplicate background jobs", async (t) => {
  const rules: CategoryRule[] = [
    {
      key: "polis",
      terms: ["polis"],
      fields: ["EmployerName"],
    },
  ];
  const statsRows: CategoryStatsRow[] = [
    {
      key: "__all__",
      total: 12,
      samples: [],
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    },
    {
      key: "polis",
      total: 3,
      samples: [{ name: "Ali", ic: "900101011234", source: "import-a" }],
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    },
  ];
  const computeDeferred = createDeferred<CategoryStatsRow[]>();
  const timeoutHandle = {
    unref() {
      return this;
    },
  } as unknown as ReturnType<typeof setTimeout>;
  let computeCalls = 0;
  let statsReady = false;

  t.mock.method(
    globalThis,
    "setTimeout",
    (((handler: TimerHandler) => {
      queueMicrotask(() => {
        if (typeof handler === "function") {
          handler();
        }
      });
      return timeoutHandle;
    }) as unknown) as typeof setTimeout,
  );
  t.mock.method(globalThis, "clearTimeout", (() => undefined) as typeof clearTimeout);

  const storage = {
    getCategoryRules: async () => rules,
    getCategoryRulesMaxUpdatedAt: async () => null,
    getCategoryStats: async (keys: string[]) =>
      statsReady ? statsRows.filter((row) => keys.includes(row.key)) : [],
    computeCategoryStatsForKeys: async (keys: string[], incomingRules: CategoryRule[]) => {
      computeCalls += 1;
      assert.deepEqual(keys, ["__all__", "polis"]);
      assert.deepEqual(incomingRules, rules);
      const rows = await computeDeferred.promise;
      statsReady = true;
      return rows;
    },
  } as unknown as PostgresStorage;

  const service = new CategoryStatsService(storage);

  const first = await service.resolveCountSummary("berapa ramai polis", 1);
  assert.equal(first?.processing, true);
  assert.equal(computeCalls, 1);

  const second = await service.resolveCountSummary("berapa ramai polis", 1);
  assert.equal(second?.processing, true);
  assert.equal(computeCalls, 1);

  computeDeferred.resolve(statsRows);
  await Promise.resolve();
  await Promise.resolve();

  const ready = await service.resolveCountSummary("berapa ramai polis", 1);
  assert.equal(ready?.processing, false);
  assert.match(ready?.summary ?? "", /- polis: 3/);
  assert.equal(computeCalls, 1);
});
