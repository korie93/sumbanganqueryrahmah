import assert from "node:assert/strict";
import test from "node:test";
import { buildSavedImportRowAriaLabel } from "@/pages/saved/saved-import-row-aria";

test("buildSavedImportRowAriaLabel summarizes saved import metadata", () => {
  assert.equal(
    buildSavedImportRowAriaLabel({
      formattedCreatedAt: "14/04/2026",
      item: {
        createdAt: "2026-04-14T00:00:00.000Z",
        filename: "report.xlsx",
        id: "import-1",
        name: "April Report",
        rowCount: 1200,
      },
    }),
    "Saved import April Report, file report.xlsx, imported 14/04/2026, 1,200 rows",
  );
});
