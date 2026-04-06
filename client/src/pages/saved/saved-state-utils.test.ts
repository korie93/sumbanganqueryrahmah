import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSavedImportSummaryLabel,
  countSavedSelectedVisibleImports,
  mergeSavedImportPages,
  pruneSavedSelectedImportIds,
  toggleSavedImportSelection,
  toggleSavedVisibleImportSelection,
} from "@/pages/saved/saved-state-utils";

test("mergeSavedImportPages deduplicates loaded items while preserving order", () => {
  const previous = [
    { id: "imp-1", name: "Batch A", filename: "a.csv", createdAt: "2026-04-01T00:00:00.000Z" },
    { id: "imp-2", name: "Batch B", filename: "b.csv", createdAt: "2026-04-02T00:00:00.000Z" },
  ];

  const merged = mergeSavedImportPages(previous, [
    { id: "imp-2", name: "Batch B Renamed", filename: "b.csv", createdAt: "2026-04-02T00:00:00.000Z" },
    { id: "imp-3", name: "Batch C", filename: "c.csv", createdAt: "2026-04-03T00:00:00.000Z" },
  ]);

  assert.deepEqual(
    merged.map((item) => item.id),
    ["imp-1", "imp-2", "imp-3"],
  );
  assert.equal(merged[1]?.name, "Batch B Renamed");
});

test("saved selection helpers keep immutable selection semantics", () => {
  const imports = [
    { id: "imp-1", name: "Batch A", filename: "a.csv", createdAt: "2026-04-01T00:00:00.000Z" },
    { id: "imp-3", name: "Batch C", filename: "c.csv", createdAt: "2026-04-03T00:00:00.000Z" },
  ];

  assert.deepEqual(Array.from(pruneSavedSelectedImportIds(new Set(["imp-1", "imp-2", "imp-3"]), imports)), [
    "imp-1",
    "imp-3",
  ]);
  assert.deepEqual(Array.from(toggleSavedImportSelection(new Set(["imp-1"]), "imp-3", true)), [
    "imp-1",
    "imp-3",
  ]);
  assert.deepEqual(Array.from(toggleSavedImportSelection(new Set(["imp-1", "imp-3"]), "imp-1", false)), [
    "imp-3",
  ]);
  assert.deepEqual(
    Array.from(toggleSavedVisibleImportSelection(new Set(["imp-2"]), imports, true)).sort(),
    ["imp-1", "imp-2", "imp-3"],
  );
  assert.equal(countSavedSelectedVisibleImports(imports, new Set(["imp-1", "imp-3", "imp-9"])), 2);
});

test("buildSavedImportSummaryLabel reflects partial and complete import loads", () => {
  assert.equal(
    buildSavedImportSummaryLabel({
      totalImports: 0,
      visibleImportCount: 0,
      hasMoreImports: false,
    }),
    "0 files",
  );
  assert.equal(
    buildSavedImportSummaryLabel({
      totalImports: 240,
      visibleImportCount: 100,
      hasMoreImports: true,
    }),
    "100 loaded of 240",
  );
  assert.equal(
    buildSavedImportSummaryLabel({
      totalImports: 18,
      visibleImportCount: 18,
      hasMoreImports: false,
    }),
    "18 files",
  );
});
