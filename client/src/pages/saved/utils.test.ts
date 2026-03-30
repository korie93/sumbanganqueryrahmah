import assert from "node:assert/strict";
import test from "node:test";

import { filterSavedImports, formatSavedFilterDate, formatSavedImportDate } from "@/pages/saved/utils";

test("formatSavedImportDate renders saved timestamps in Malaysia time", () => {
  assert.equal(
    formatSavedImportDate("2026-03-29T16:30:00.000Z"),
    "30/03/2026, 12:30 AM",
  );
});

test("formatSavedFilterDate renders filter labels in Malaysia date format", () => {
  assert.equal(
    formatSavedFilterDate(new Date("2026-03-29T16:30:00.000Z")),
    "30/03/2026",
  );
});

test("filterSavedImports compares created dates using Malaysia calendar days", () => {
  const imports = [
    {
      id: "imp-1",
      name: "March batch",
      filename: "march.xlsx",
      createdAt: "2026-03-29T16:30:00.000Z",
      rowCount: 100,
    },
  ];

  const filtered = filterSavedImports(
    imports,
    "",
    new Date("2026-03-30T00:00:00.000+08:00"),
  );

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, "imp-1");
});
