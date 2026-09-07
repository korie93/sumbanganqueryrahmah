import assert from "node:assert/strict";
import test from "node:test";
import { loadCollectionOspConfiguredSourceScope } from "../collection-osp-source-scope-repository-utils";

function source(id: string, from: string, to: string, count = 1) {
  return { source_import_id: id, valid_from: from, valid_to: to, indexed_row_count: count };
}
async function load(rows: ReturnType<typeof source>[], ids = rows.map((row) => row.source_import_id)) {
  let queries = 0;
  const result = await loadCollectionOspConfiguredSourceScope({ execute: async () => { queries++; return { rows }; } }, ids);
  assert.equal(queries, 1, "all source validity is validated in one bounded query");
  assert.deepEqual(result.sources, rows);
  return { from: result.from, to: result.to };
}

test("source validity uses the full union for equal, overlapping, nested and disjoint configured files", async () => {
  for (const rows of [
    [source("a", "2026-08-12", "2026-09-10")],
    [source("a", "2026-08-12", "2026-09-10"), source("b", "2026-08-12", "2026-09-10")],
    [source("a", "2026-08-12", "2026-08-20"), source("b", "2026-08-18", "2026-09-10")],
    [source("a", "2026-08-12", "2026-09-10"), source("b", "2026-08-18", "2026-08-20")],
    [source("a", "2026-08-12", "2026-08-20"), source("b", "2026-09-01", "2026-09-10")],
  ]) {
    assert.deepEqual(await load(rows), { from: "2026-08-12", to: "2026-09-10" });
    assert.deepEqual(await load([...rows].reverse()), { from: "2026-08-12", to: "2026-09-10" });
  }
});

test("combined validity accepts exactly 366 inclusive days and rejects 367 even when every source is individually short", async () => {
  assert.deepEqual(await load([source("a", "2025-09-10", "2025-09-12"), source("b", "2026-09-09", "2026-09-10")]),
    { from: "2025-09-10", to: "2026-09-10" });
  await assert.rejects(load([source("a", "2025-09-09", "2025-09-12"), source("b", "2026-09-09", "2026-09-10")]), /combined configured validity.*366 days/);
  assert.deepEqual(await load([source("leap", "2024-01-01", "2024-12-31")]), { from: "2024-01-01", to: "2024-12-31" });
  await assert.rejects(load([source("leap", "2024-01-01", "2025-01-01")]), /366 days/);
});

test("each source must retain a real ordered DATE and source count/identity/row limits remain enforced", async () => {
  for (const [from, to] of [["", "2026-09-10"], ["2026-02-30", "2026-09-10"], ["2026-08-12", "2026-13-01"],
    ["0000-01-01", "2026-09-10"], ["2026-09-11", "2026-09-10"]]) {
    await assert.rejects(load([source("valid", "2026-08-12", "2026-09-10"), source("invalid", from!, to!)]), /valid, ordered configured dates/);
  }
  const a = source("a", "2026-08-12", "2026-09-10");
  for (const ids of [[], ["a", "a"], [" "], ["x".repeat(201)], ["a", "b", "c", "d", "e", "f"]]) {
    await assert.rejects(load([a], ids), /1 and 5 unique/);
  }
  await assert.rejects(load([a], ["a", "missing"]), /unavailable or incompatible/);
  await assert.rejects(load([source("a", "2026-08-12", "2026-08-20", 60_000), source("b", "2026-08-21", "2026-09-10", 40_001)]), /100,000 rows/);
});
